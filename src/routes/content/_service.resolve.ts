import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { Content } from "@/routes/content/_schema";
import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";

type RelationField = {
	field: string;
	targetSlug: string;
	isMany: boolean;
};

export type ResolvedContent = Content & {
	data: Record<string, unknown>;
};

const getRelationFields = (
	schema: Record<string, unknown>,
): RelationField[] => {
	const properties =
		schema.properties &&
		typeof schema.properties === "object" &&
		!Array.isArray(schema.properties)
			? (schema.properties as Record<string, Record<string, unknown>>)
			: {};

	const relations: RelationField[] = [];

	for (const [field, property] of Object.entries(properties)) {
		const targetSlug = property["x-relation"];
		if (typeof targetSlug !== "string" || targetSlug.length === 0) {
			continue;
		}

		const isMany = property.type === "array";
		relations.push({ field, targetSlug, isMany });
	}

	return relations;
};

const parseResolveFields = (resolve: string): string[] =>
	resolve
		.split(",")
		.map((field) => field.trim())
		.filter((field) => field.length > 0);

const collectTargetIds = (
	rows: Content[],
	relationByField: ReadonlyMap<string, RelationField>,
	requestedFields: readonly string[],
): Map<string, Set<string>> => {
	const targetIdsByField = new Map<string, Set<string>>();

	for (const field of requestedFields) {
		targetIdsByField.set(field, new Set());
	}

	for (const row of rows) {
		for (const field of requestedFields) {
			const relation = relationByField.get(field);
			if (!relation) continue;

			const value = row.data[field];
			if (value === undefined || value === null) continue;

			const targetIds = targetIdsByField.get(field);
			if (!targetIds) continue;

			if (relation.isMany) {
				if (!Array.isArray(value)) continue;
				for (const id of value) {
					if (typeof id === "string") {
						targetIds.add(id);
					}
				}
			} else {
				if (typeof value === "string") {
					targetIds.add(value);
				}
			}
		}
	}

	return targetIdsByField;
};

export const resolveRelations = (
	input: {
		rows: Content[];
		resolve: string;
		schema: Record<string, unknown>;
	},
	deps: Deps,
): ResultAsync<ResolvedContent[], AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const requestedFields = parseResolveFields(input.resolve);

		if (requestedFields.length === 0) {
			return ok(input.rows as ResolvedContent[]);
		}

		const relationFields = getRelationFields(input.schema);
		const relationByField = new Map(
			relationFields.map((relation) => [relation.field, relation]),
		);

		for (const field of requestedFields) {
			if (!relationByField.has(field)) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.VALIDATION_FAILED,
						message: `Cannot resolve unknown or non-relation field: ${field}`,
						status: 400,
					}),
				);
			}
		}

		const targetIdsByField = collectTargetIds(
			input.rows,
			relationByField,
			requestedFields,
		);

		const targetCollectionIds = new Map<string, string>();
		const allTargetIds = new Set<string>();

		for (const [field, targetIds] of targetIdsByField.entries()) {
			const relation = relationByField.get(field);
			if (!relation) continue;

			const targetCollection = yield* deps.DL.collection.getCollectionBySlug({
				slug: relation.targetSlug,
			});

			if (!targetCollection) {
				continue;
			}

			targetCollectionIds.set(field, targetCollection.id);

			for (const id of targetIds) {
				allTargetIds.add(id);
			}
		}

		if (allTargetIds.size === 0) {
			return ok(input.rows as ResolvedContent[]);
		}

		const relatedRows = yield* deps.DL.content.getContentByIds({
			ids: Array.from(allTargetIds),
		});

		const relatedById = new Map(relatedRows.map((row) => [row.id, row]));

		const resolvedRows = input.rows.map((row) => {
			const resolvedData: Record<string, unknown> = { ...row.data };

			for (const [field, targetCollectionId] of targetCollectionIds.entries()) {
				const relation = relationByField.get(field);
				if (!relation) continue;

				const value = row.data[field];
				if (value === undefined || value === null) continue;

				const resolveId = (id: string): unknown => {
					const related = relatedById.get(id);
					if (!related || related.collectionId !== targetCollectionId) {
						return id;
					}
					return related;
				};

				if (relation.isMany) {
					if (Array.isArray(value)) {
						resolvedData[field] = value.map((id) =>
							typeof id === "string" ? resolveId(id) : id,
						);
					}
				} else {
					if (typeof value === "string") {
						resolvedData[field] = resolveId(value);
					}
				}
			}

			return { ...row, data: resolvedData };
		});

		return ok(resolvedRows);
	});
