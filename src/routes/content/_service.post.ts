import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { validateContentData } from "@/lib/schema";
import type { CollectionSlugParam } from "@/routes/collection/_schema";
import type { Content, CreateContentInput } from "./_schema";

export const createContent = (
	input: CollectionSlugParam & CreateContentInput,
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

		if (!collection.currentSchemaVersionId) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
					message: "Collection has no current schema version",
					status: 409,
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

		const created = yield* deps.DL.content.createContent({
			collectionId: collection.id,
			data: JSON.stringify(input.data),
			schemaVersionId: collection.currentSchemaVersionId,
			status: input.status ?? "draft",
		});

		return ok(created);
	});
