import {
	type RootOperationNode,
	type Compilable,
	type QueryExecutor,
	Kysely,
	type QueryResult,
	type UnknownRow,
} from "kysely";

type Batchable = {
	toOperationNode(): RootOperationNode;
};
type QueryOutput<Q> = Q extends Compilable<infer O> ? O : unknown;
type ExecutorBearer = {
	getExecutor(): QueryExecutor;
};
type QueryId = {
	queryId: string;
};

export type Batcher<DB> = <Q extends readonly Batchable[], S extends readonly Batchable[] = []>(
	statements: Q,
	sideEffects?: S,
) => Promise<{
	[P in keyof Q]: QueryOutput<Q[P]>[];
}>;

export const createBatcher = <DB>(args: {
	database: D1DatabaseSession | D1Database;
	kysely: Kysely<DB>;
}): Batcher<DB> => {
	const { database, kysely } = args;
	const executor = (kysely as unknown as ExecutorBearer).getExecutor();

	return async <Q extends readonly Batchable[], S extends readonly Batchable[] = []>(
		statements: Q,
		sideEffects?: S,
	): Promise<{
		[P in keyof Q]: QueryOutput<Q[P]>[];
	}> => {
		const all = sideEffects ? [...statements, ...sideEffects] : statements;

		if (all.length === 0) {
			return [] as unknown as {
				[P in keyof Q]: QueryOutput<Q[P]>[];
			};
		}

		const compiled = all.map((statement) => {
			const queryId = createQueryId();
			const node = executor.transformQuery(
				statement.toOperationNode(),
				queryId,
			);
			const compiledQuery = executor.compileQuery(node, queryId);

			return { queryId, compiledQuery };
		});

		const results = await database.batch(
			compiled.map(({ compiledQuery }) =>
				database.prepare(compiledQuery.sql).bind(...compiledQuery.parameters),
			),
		);

		const rows = await Promise.all(
			results.map(async (d1Result, index) => {
				const compiledStatement = compiled[index];

				if (compiledStatement === undefined) {
					throw new Error("Batch result count mismatch");
				}

				const { queryId } = compiledStatement;
				let result: QueryResult<UnknownRow> = transformD1Result(d1Result);

				for (const plugin of executor.plugins) {
					result = await plugin.transformResult({ result, queryId });
				}

				return result.rows;
			}),
		);

		return rows.slice(0, statements.length) as {
			[P in keyof Q]: QueryOutput<Q[P]>[];
		};
	};
};
let queryIdCounter = 0;
const createQueryId = (): QueryId => ({
	queryId: `batch_qid_${queryIdCounter++}`,
});
const transformD1Result = (result: D1Result): QueryResult<UnknownRow> => {
	if (result.error) {
		throw new Error(result.error);
	}

	const numAffectedRows =
		result.meta.changes > 0 ? BigInt(result.meta.changes) : undefined;

	return {
		insertId:
			result.meta.last_row_id === undefined || result.meta.last_row_id === null
				? undefined
				: BigInt(result.meta.last_row_id),
		rows: (result.results ?? []) as UnknownRow[],
		numAffectedRows,
	};
};
