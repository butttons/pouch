import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { ContentFilter, ContentSort, DataLayerError } from "@/lib/data";
import { decodeSortCursor, type SortCursor } from "@/lib/data/content";
import {
	buildJsonExtractExpression,
	getSortableFields,
} from "@/lib/content-index";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import {
	type FilterOperator,
	getAllowedOperators,
	isFilterOperator,
} from "@/lib/query-filter";
import { enrichMediaPaths } from "@/lib/schema";
import { isValid } from "@/lib/validator";

import type { CollectionSlugParam } from "@/routes/collection/_schema";
import { requireCollectionBySlug } from "@/routes/collection/_util.require-collection";

import type { ContentListResponse, ContentQuery } from "./_schema";
import { contentStatusSchema } from "./_schema";
import { resolveRelations } from "./_service.resolve";
import { normalizeResolveParam } from "./_util.normalize-resolve";
import type { Deps } from "@/deps";

const QUERY_KEY_REGEX = /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\[([a-z]+)\])?$/;

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

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

const coerceFilterValue = (input: {
	rawValue: unknown;
	op: FilterOperator;
	type: unknown;
}): string | number | boolean | (string | number | boolean)[] => {
	const valueString =
		(Array.isArray(input.rawValue) ? input.rawValue[0] : input.rawValue) ?? "";
	const stringValue = String(valueString);

	if (input.op === "in" || input.op === "nin") {
		return stringValue
			.split(",")
			.filter((item) => item.length > 0)
			.map((item) => coerceValue(item, input.type));
	}

	return coerceValue(stringValue, input.type);
};

const QUERY_META_KEYS = new Set([
	"resolve",
	"limit",
	"cursor",
	"sort",
	"direction",
]);

const BUILTIN_SORT_FIELDS: Record<string, { expression: string }> = {
	createdAt: { expression: "created_at" },
	updatedAt: { expression: "updated_at" },
};

const parseSort = (
	raw: unknown,
	schema: Record<string, unknown>,
): { sort?: ContentSort; error?: AppHTTPException } => {
	if (raw === undefined) {
		return {};
	}

	const text = String(Array.isArray(raw) ? raw[0] : raw);
	const direction = text.startsWith("-") ? "desc" : "asc";
	const field = text.startsWith("-") ? text.slice(1) : text;

	const builtin = BUILTIN_SORT_FIELDS[field];

	if (builtin) {
		return {
			sort: {
				field,
				expression: builtin.expression,
				direction,
			},
		};
	}

	const sortable = getSortableFields(schema).find(
		(candidate) => candidate.field === field,
	);

	if (!sortable) {
		return {
			error: new AppHTTPException({
				code: ErrorCodes.VALIDATION_FAILED,
				message: `Invalid sort field: ${field} (allowed: createdAt, updatedAt, or an x-index scalar field)`,
				status: 400,
			}),
		};
	}

	return {
		sort: {
			field,
			expression: buildJsonExtractExpression({ field }),
			direction,
		},
	};
};

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

			if (!isFilterOperator(op)) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.VALIDATION_FAILED,
						message: `Invalid query operator: ${op}`,
						status: 400,
					}),
				);
			}

			const property = properties[field] as Record<string, unknown> | undefined;

			if (field === "status") {
				const allowed = ["eq", "ne", "in", "nin"];

				if (!allowed.includes(op)) {
					return err(
						new AppHTTPException({
							code: ErrorCodes.VALIDATION_FAILED,
							message: `Operator ${op} is not allowed for field status`,
							status: 400,
						}),
					);
				}

				const value = coerceFilterValue({ rawValue, op, type: "string" });
				const values = Array.isArray(value) ? value : [value];

				if (
					values.length === 0 ||
					values.some((v) => !isValid(v, contentStatusSchema))
				) {
					return err(
						new AppHTTPException({
							code: ErrorCodes.VALIDATION_FAILED,
							message: `Invalid status value: ${values.join(", ")}`,
							status: 400,
						}),
					);
				}

				filters.push({ field, op, value, column: "status" });
				continue;
			}

			if (!property) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.VALIDATION_FAILED,
						message: `Unknown filter field: ${field}`,
						status: 400,
					}),
				);
			}

			const allowedOperators = getAllowedOperators(property);

			if (allowedOperators.length === 0) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.VALIDATION_FAILED,
						message: `Field type does not support filtering: ${field}`,
						status: 400,
					}),
				);
			}

			if (!allowedOperators.includes(op)) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.VALIDATION_FAILED,
						message: `Operator ${op} is not allowed for field ${field}`,
						status: 400,
					}),
				);
			}

			const value = coerceFilterValue({
				rawValue,
				op,
				type: property.type,
			});

			if (
				(op === "in" || op === "nin") &&
				Array.isArray(value) &&
				value.length === 0
			) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.VALIDATION_FAILED,
						message: `Operator ${op} requires at least one value for field ${field}`,
						status: 400,
					}),
				);
			}

			filters.push({ field, op, value });
		}

		const limit = parseLimit(input.query.limit);
		const cursor =
			typeof input.query.cursor === "string" ? input.query.cursor : undefined;

		const { sort, error: sortError } = parseSort(
			input.query.sort,
			collection.schema,
		);

		if (sortError) {
			return err(sortError);
		}

		const directionRaw = input.query.direction;
		const direction =
			directionRaw === undefined
				? "forward"
				: String(Array.isArray(directionRaw) ? directionRaw[0] : directionRaw);

		if (direction !== "forward" && direction !== "backward") {
			return err(
				new AppHTTPException({
					code: ErrorCodes.VALIDATION_FAILED,
					message: `Invalid direction: ${direction} (allowed: forward, backward)`,
					status: 400,
				}),
			);
		}

		if (direction === "backward" && cursor === undefined) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.VALIDATION_FAILED,
					message: "cursor is required when direction=backward",
					status: 400,
				}),
			);
		}

		let sortCursor: SortCursor | undefined;

		if (sort !== undefined && cursor !== undefined) {
			const decoded = decodeSortCursor(cursor);

			if (!decoded) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.VALIDATION_FAILED,
						message: "Invalid cursor for sorted query",
						status: 400,
					}),
				);
			}

			sortCursor = decoded;
		}

		const { rows, nextCursor, prevCursor } = yield* deps.DL.content.listContent(
			{
				collectionId: collection.id,
				filters,
				limit,
				cursor,
				sort,
				sortCursor,
				direction,
			},
		);

		const enrichedRows = rows.map((row) => ({
			...row,
			data: enrichMediaPaths({
				data: row.data,
				schema: collection.schema,
				mediaPublicUrl: deps.mediaPublicUrl,
			}),
		}));

		const resolve = normalizeResolveParam(input.query.resolve);

		if (!resolve) {
			return ok({ data: enrichedRows, nextCursor, prevCursor });
		}

		const resolved = yield* resolveRelations(
			{
				rows: enrichedRows,
				resolve,
				schema: collection.schema,
			},
			deps,
		);

		return ok({ data: resolved, nextCursor, prevCursor });
	});
