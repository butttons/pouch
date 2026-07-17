import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import type { Deps } from "@/deps";
import type {
	CollectionIdParam,
	DeleteCollectionQuery,
} from "./_schema";

export const deleteCollection = (
	input: CollectionIdParam & { isForced: boolean },
	deps: Deps,
): ResultAsync<void, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* deps.DL.collection.getCollectionById({
			id: input.id,
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
				collectionId: input.id,
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

		yield* deps.DL.collection.deleteCollectionById({ id: input.id });

		return ok(undefined);
	});
