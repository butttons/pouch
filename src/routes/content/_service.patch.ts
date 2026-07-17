import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { validateContentData } from "@/lib/schema";
import type { Content, ContentRouteParams, UpdateContentInput } from "./_schema";

export const updateContent = (
	input: ContentRouteParams & UpdateContentInput,
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

		const mergedData = input.data
			? { ...existing.data, ...input.data }
			: existing.data;

		const validation = validateContentData({
			data: mergedData,
			schema: collection.schema,
		});

		if (validation.isErr()) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.VALIDATION_FAILED,
					message: "Content validation failed",
					status: 400,
					cause: validation.error,
				}),
			);
		}

		const updated = yield* deps.DL.content.updateContent({
			id: input.id,
			data: JSON.stringify(mergedData),
			status: input.status,
		});

		return ok(updated);
	});
