import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { validateContentData } from "@/lib/schema";
import type { CollectionSlugParam } from "@/routes/collection/_schema";
import type { CreateContentInput } from "./_schema";

export const validateContent = (
	input: CollectionSlugParam & CreateContentInput,
	deps: Deps,
): ResultAsync<{ valid: boolean }, AppHTTPException | DataLayerError> =>
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

		const validation = validateContentData({
			data: input.data,
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

		return ok({ valid: true });
	});
