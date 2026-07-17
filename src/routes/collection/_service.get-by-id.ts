import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import type { Deps } from "@/deps";
import type { CollectionIdParam, CollectionWithSchema } from "./_schema";

export const getCollectionById = (
	input: CollectionIdParam,
	deps: Deps,
): ResultAsync<CollectionWithSchema, AppHTTPException | DataLayerError> =>
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

		return ok(collection);
	});
