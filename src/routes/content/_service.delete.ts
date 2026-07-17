import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import type { ContentRouteParams } from "./_schema";

export const deleteContent = (
	input: ContentRouteParams,
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

		const existing = yield* deps.DL.content.getContentById({ id: input.id });

		if (!existing || existing.collectionId !== collection.id) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.NOT_FOUND,
					message: "Content not found",
					status: 404,
				}),
			);
		}

		yield* deps.DL.content.deleteContentById({ id: input.id });

		return ok(undefined);
	});
