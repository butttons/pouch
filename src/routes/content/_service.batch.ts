import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { enrichMediaPaths } from "@/lib/schema";

import type { CollectionSlugParam } from "@/routes/collection/_schema";
import { requireCollectionBySlug } from "@/routes/collection/_util.require-collection";

import type { Content, CreateContentBatchInput } from "./_schema";
import {
	validateContentOrFail,
	validateMediaFieldsForBatch,
} from "./_util.validate-content";
import type { Deps } from "@/deps";

/**
 * Creates multiple content items in a single D1 batch request.
 */
export const createContentBatch = (
	input: CollectionSlugParam & CreateContentBatchInput,
	deps: Deps,
): ResultAsync<Content[], AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		if (!collection.currentSchemaVersionId) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
					message: "Collection has no current schema version",
					status: 409,
				}),
			);
		}

		const schemaVersionId = collection.currentSchemaVersionId;

		for (const item of input.items) {
			yield* validateContentOrFail({
				data: item.data,
				schema: collection.schema,
			});
		}

		yield* validateMediaFieldsForBatch({
			items: input.items.map((item) => item.data),
			schema: collection.schema,
			DL: deps.DL,
		});

		const created = yield* deps.DL.content.createContentBatch({
			items: input.items.map((item) => ({
				collectionId: collection.id,
				data: JSON.stringify(item.data),
				schemaVersionId,
				status: item.status ?? "draft",
			})),
		});

		const data = created.map((row) =>
			enrichMediaPaths({
				data: row.data,
				schema: collection.schema,
				mediaPublicUrl: deps.mediaPublicUrl,
			}),
		);

		return ok(
			created.map((row, index) => ({
				...row,
				data: data[index] ?? row.data,
			})),
		);
	});
