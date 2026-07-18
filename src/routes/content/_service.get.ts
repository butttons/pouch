import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { ContentFilter, DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { computeIndexColumnName } from "@/lib/content-index";
import { requireCollectionBySlug } from "@/routes/collection/_util.require-collection";
import { normalizeResolveParam } from "./_util.normalize-resolve";
import type { CollectionSlugParam } from "@/routes/collection/_schema";
import type { ContentListResponse, ContentQuery } from "./_schema";
import { resolveRelations } from "./_service.resolve";

const QUERY_KEY_REGEX = /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\[([a-z]+)\])?$/;
const ALLOWED_OPS = ["eq", "gt", "gte", "lt", "lte", "ne"] as const;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

type AllowedOp = (typeof ALLOWED_OPS)[number];

const isAllowedOp = (value: string): value is AllowedOp =>
	ALLOWED_OPS.includes(value as AllowedOp);

const coerceValue = (
	value: string,
	type: unknown,
): string | number | boolean => {
	if (type === "number" || type === "integer") {
		return Number(value);
	}

	if (type === "boolean") {
		return value === "true";
	}

	return value;
};

const QUERY_META_KEYS = new Set(["resolve", "limit", "cursor"]);

const parseLimit = (raw: unknown): number => {
	if (raw === undefined) {
		return DEFAULT_LIMIT;
	}

	const parsed = typeof raw === "string" ? Number(raw) : Number(raw);

	if (!Number.isFinite(parsed) || parsed < 1) {
		return DEFAULT_LIMIT;
	}

	return Math.min(parsed, MAX_LIMIT);
};

/**
 * Lists content with query filters, pagination, and optional relation resolution.
 */
export const listContent = (
	input: CollectionSlugParam & { query: ContentQuery },
	deps: Deps,
): ResultAsync<ContentListResponse, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		const properties =
			collection.schema.properties &&
			typeof collection.schema.properties === "object" &&
			!Array.isArray(collection.schema.properties)
				? (collection.schema.properties as Record<
						string,
						Record<string, unknown>
				  >)
				: {};

		const filters: ContentFilter[] = [];

		for (const [key, rawValue] of Object.entries(input.query)) {
			if (QUERY_META_KEYS.has(key)) {
				continue;
			}

			const match = QUERY_KEY_REGEX.exec(key);

			if (!match) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.VALIDATION_FAILED,
						message: `Invalid query key: ${key}`,
						status: 400,
					}),
				);
			}

			const field = match[1] as string;
			const opRaw = match[2];
			const op = opRaw ?? "eq";

			if (!isAllowedOp(op)) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.VALIDATION_FAILED,
						message: `Invalid query operator: ${op}`,
						status: 400,
					}),
				);
			}

			const property = properties[field] as Record<string, unknown> | undefined;

			if (!property) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.VALIDATION_FAILED,
						message: `Unknown filter field: ${field}`,
						status: 400,
					}),
				);
			}

			const valueString = (
				Array.isArray(rawValue) ? rawValue[0] : rawValue
			) ?? "";
			const value = coerceValue(String(valueString), property.type);

			const indexedColumn =
				property["x-index"] === true
					? computeIndexColumnName({
							collectionId: collection.id,
							field,
					  })
					: undefined;

			filters.push({ field, op, value, indexedColumn });
		}

		const limit = parseLimit(input.query.limit);
		const cursor =
			typeof input.query.cursor === "string" ? input.query.cursor : undefined;

		const { rows, nextCursor } = yield* deps.DL.content.listContent({
			collectionId: collection.id,
			filters,
			limit,
			cursor,
		});

		const resolve = normalizeResolveParam(input.query.resolve);

		if (!resolve) {
			return ok({ data: rows, nextCursor });
		}

		const resolved = yield* resolveRelations(
			{
				rows,
				resolve,
				schema: collection.schema,
			},
			deps,
		);

		return ok({ data: resolved, nextCursor });
	});
