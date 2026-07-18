import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import type { Deps } from "@/deps";
import { requireCollectionBySlug } from "./_util.require-collection";
import type {
	CollectionSlugParam,
	DeleteCollectionQuery,
} from "./_schema";

export const deleteCollection = (
	input: CollectionSlugParam & { isForced: boolean },
	deps: Deps,
): ResultAsync<void, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		if (!input.isForced) {
			const countRow = yield* deps.DL.collection.countContentByCollectionId({
				collectionId: collection.id,
			});
			const count = countRow?.count ?? 0;

			if (count > 0) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.COLLECTION_DELETE_FAILED,
						message:
							"Collection has content. Use force=true to delete anyway.",
						status: 409,
					}),
				);
			}
		}

		const activeIndexes = yield* deps.DL.contentIndex.listActiveIndexesByCollectionId({
			collectionId: collection.id,
		});

		for (const { field } of activeIndexes) {
			yield* deps.DL.contentIndex.dropIndex({
				collectionId: collection.id,
				field,
			});
		}

		yield* deps.DL.collection.deleteCollectionById({ id: collection.id });

		return ok(undefined);
	});
