import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { enrichMediaPaths } from "@/lib/schema";
import { typedId } from "@/lib/typed-id";

import type { CollectionSlugParam } from "@/routes/collection/_schema";
import { requireCollectionBySlug } from "@/routes/collection/_util.require-collection";

import type { Content, CreateContentInput } from "./_schema";
import {
	validateContentOrFail,
	validateMediaFieldsOrFail,
} from "./_util.validate-content";
import type { Deps } from "@/deps";

/**
 * Creates new content and validates it against the collection's current schema.
 */
export const createContent = (
	input: CollectionSlugParam & CreateContentInput,
	deps: Deps,
): ResultAsync<Content, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		if (!collection.currentSchemaVersionId) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
					message: "Collection has no current schema version",
					status: 409,
				}),
			);
		}

		yield* validateContentOrFail({
			data: input.data,
			schema: collection.schema,
		});
		yield* validateMediaFieldsOrFail({
			data: input.data,
			schema: collection.schema,
			DL: deps.DL,
		});

		const contentId = typedId("content");

		const created = yield* deps.DL.content.createContent(
			{
				id: contentId,
				collectionId: collection.id,
				data: JSON.stringify(input.data),
				schemaVersionId: collection.currentSchemaVersionId,
				status: input.status ?? "draft",
			},
			{
				action: "content.create",
				actor: deps.actor,
				targetId: contentId,
				diff: null,
			},
		);

		const enrichedData = enrichMediaPaths({
			data: created.data,
			schema: collection.schema,
			mediaPublicUrl: deps.mediaPublicUrl,
		});

		return ok({ ...created, data: enrichedData });
	});
