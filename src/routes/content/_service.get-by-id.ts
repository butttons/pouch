import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import type { Content, ContentRouteParams } from "./_schema";

export const getContentById = (
	input: ContentRouteParams,
	deps: Deps,
): ResultAsync<Content, AppHTTPException | DataLayerError> =>
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

		const content = yield* deps.DL.content.getContentById({ id: input.id });

		if (!content || content.collectionId !== collection.id) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.NOT_FOUND,
					message: "Content not found",
					status: 404,
				}),
			);
		}

		return ok(content);
	});
