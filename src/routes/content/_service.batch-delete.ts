import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";

import type { CollectionSlugParam } from "@/routes/collection/_schema";
import { requireCollectionBySlug } from "@/routes/collection/_util.require-collection";

import type { DeleteContentBatchInput } from "./_schema";
import type { Deps } from "@/deps";

/**
 * Deletes multiple content items in a single request.
 */
export const deleteContentBatch = (
	input: CollectionSlugParam & DeleteContentBatchInput,
	deps: Deps,
): ResultAsync<void, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		if (input.ids.length !== new Set(input.ids).size) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.VALIDATION_FAILED,
					message: "Duplicate content IDs in batch delete",
					status: 400,
				}),
			);
		}

		const existingRows = yield* deps.DL.content.getContentByIds({
			ids: input.ids,
		});

		const foundIds = new Set(
			existingRows
				.filter((row) => row.collectionId === collection.id)
				.map((row) => row.id),
		);
		const missingIds = input.ids.filter((id) => !foundIds.has(id));

		if (missingIds.length > 0) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.NOT_FOUND,
					message: `Content not found: ${missingIds.join(", ")}`,
					status: 404,
				}),
			);
		}

		yield* deps.DL.content.deleteContentBatch({ ids: input.ids });

		return ok(undefined);
	});
