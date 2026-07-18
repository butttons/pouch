import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { enrichMediaPaths } from "@/lib/schema";

import type { CollectionSlugParam } from "@/routes/collection/_schema";
import { requireCollectionBySlug } from "@/routes/collection/_util.require-collection";

import type { Content, UpdateContentBatchInput } from "./_schema";
import {
	validateContentOrFail,
	validateMediaFieldsForBatch,
} from "./_util.validate-content";
import type { Deps } from "@/deps";

/**
 * Updates multiple content items in a single D1 batch request.
 */
export const updateContentBatch = (
	input: CollectionSlugParam & UpdateContentBatchInput,
	deps: Deps,
): ResultAsync<Content[], AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		const ids = input.items.map((item) => item.id);

		if (ids.length !== new Set(ids).size) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.VALIDATION_FAILED,
					message: "Duplicate content IDs in batch update",
					status: 400,
				}),
			);
		}

		const existingRows = yield* deps.DL.content.getContentByIds({ ids });
		const existingById = new Map(existingRows.map((row) => [row.id, row]));

		const missingIds = ids.filter((id) => {
			const existing = existingById.get(id);
			return !existing || existing.collectionId !== collection.id;
		});

		if (missingIds.length > 0) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.NOT_FOUND,
					message: `Content not found: ${missingIds.join(", ")}`,
					status: 404,
				}),
			);
		}

		const mergedItems = input.items.map((item) => {
			const existing = existingById.get(item.id)!;
			const mergedData = item.data
				? { ...existing.data, ...item.data }
				: existing.data;

			return {
				id: item.id,
				data: mergedData,
				status: item.status,
			};
		});

		for (const item of mergedItems) {
			yield* validateContentOrFail({
				data: item.data,
				schema: collection.schema,
			});
		}

		yield* validateMediaFieldsForBatch({
			items: mergedItems.map((item) => item.data),
			schema: collection.schema,
			DL: deps.DL,
		});

		const updated = yield* deps.DL.content.updateContentBatch(
			{
				items: mergedItems.map((item) => ({
					id: item.id,
					data: JSON.stringify(item.data),
					status: item.status,
				})),
			},
			{
				action: "content.batch.update",
				actor: deps.actor,
				targetId: collection.id,
				diff: { ids: input.items.map((item) => item.id) },
			},
		);

		const data = updated.map((row) =>
			enrichMediaPaths({
				data: row.data,
				schema: collection.schema,
				mediaPublicUrl: deps.mediaPublicUrl,
			}),
		);

		return ok(
			updated.map((row, index) => ({
				...row,
				data: data[index] ?? row.data,
			})),
		);
	});
