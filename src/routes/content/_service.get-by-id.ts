import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import type { Content, ContentRouteParams } from "./_schema";
import { resolveRelations } from "./_service.resolve";

export const getContentById = (
	input: ContentRouteParams & { resolve?: string | string[] },
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

		const resolve =
			typeof input.resolve === "string" ? input.resolve : input.resolve?.[0];

		if (!resolve) {
			return ok(content);
		}

		const resolved = yield* resolveRelations(
			{
				rows: [content],
				resolve,
				schema: collection.schema,
			},
			deps,
		);

		return ok(resolved[0] ?? content);
	});
