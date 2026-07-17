import type { ResultAsync } from "neverthrow";

import { type AppEntity, typedId } from "../typed-id";

import { DataLayerError } from "./_error";

const ERROR_NOUNS = [
	"GET",
	"DELETE",
	"UPDATE",
	"CREATE",
	"SYNC",
	"VALIDATE",
] as const;
const ERROR_VERBS = ["FAILED", "NOT_FOUND", "EXPIRED", "INVALID"] as const;

type ErrorNoun = (typeof ERROR_NOUNS)[number];
type ErrorVerb = (typeof ERROR_VERBS)[number];

type ErrorCode = `${ErrorNoun}_${ErrorVerb}`;

export type ResultAsyncValue<T> =
	T extends ResultAsync<infer V, unknown> ? V : never;

export type ResultAsyncError<T> =
	T extends ResultAsync<unknown, infer E> ? E : never;

export class BaseDataLayer {
	public entity: AppEntity = "misc";

	public passThroughError(input: {
		message: string;
		code: ErrorCode;
		source: string;
		input: unknown;
		options?: ErrorOptions;
		context?: {
			input?: unknown;
		};
	}) {
		return (error: unknown) => {
			console.warn(input.message, input, error);

			if (error instanceof DataLayerError) {
				return error;
			}

			const newError = new DataLayerError(input.message, {
				...input.options,
				cause: error,
				code: input.code,
				source: input.source,
				input: input.input,
			});

			return newError;
		};
	}

	protected async unwrap<T, E>(result: ResultAsync<T, E>): Promise<T> {
		const awaited = await result;
		if (awaited.isErr()) {
			throw awaited.error;
		}
		return awaited.value;
	}

	public parseOutputDate(ms: number | null) {
		return ms !== null ? new Date(ms) : null;
	}

	public forUpdate<T extends Record<string, unknown>>(
		data: T,
	): T & { updated_at: number } {
		return {
			updated_at: Date.now(),
			...data,
		};
	}

	public forInsert<T extends Record<string, unknown>>(
		data: T,
		entity?: AppEntity,
	): T & { id: string; created_at: number; updated_at: number } {
		const now = Date.now();
		return {
			id: typedId(entity ?? this.entity),
			created_at: (data.created_at as number | undefined) ?? now,
			updated_at: (data.updated_at as number | undefined) ?? now,
			...data,
		};
	}

	public toUpper<K extends string>(strings: K[]) {
		return strings.map((s) => s.toUpperCase());
	}

	public toLower<K extends string>(strings: K[]) {
		return strings.map((s) => s.toLowerCase());
	}
}
