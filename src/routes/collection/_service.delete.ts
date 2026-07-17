import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import type { Deps } from "@/deps";
import type {
	CollectionSlugParam,
	DeleteCollectionQuery,
} from "./_schema";

export const deleteCollection = (
	input: CollectionSlugParam & { isForced: boolean },
	deps: Deps,
): ResultAsync<void, AppHTTPException | DataLayerError> =>
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

		yield* deps.DL.collection.deleteCollectionById({ id: collection.id });

		return ok(undefined);
	});
