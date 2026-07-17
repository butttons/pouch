import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { ContentFilter, DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import type { CollectionSlugParam } from "@/routes/collection/_schema";
import type { Content, ContentQuery } from "./_schema";

const QUERY_KEY_REGEX = /^([a-zA-Z_][a-zA-Z0-9_]*)(?:\[([a-z]+)\])?$/;
const ALLOWED_OPS = ["eq", "gt", "gte", "lt", "lte", "ne"] as const;

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

export const listContent = (
	input: CollectionSlugParam & { query: ContentQuery },
	deps: Deps,
): ResultAsync<Content[], AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* deps.DL.collection.getCollectionBySlug({
			slug: input.slug,
		});

		if (!collection) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.NOT_FOUND,
					message: "Collection not found",
					status: 404,
				}),
			);
		}

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
			const value = coerceValue(valueString, property.type);

			filters.push({ field, op, value });
		}

		const rows = yield* deps.DL.content.listContent({
			collectionId: collection.id,
			filters,
		});

		return ok(rows);
	});
