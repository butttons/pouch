import { err, ok, ResultAsync, safeTry } from "neverthrow";

import { getIndexedFields } from "@/lib/content-index";
import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { validateCollectionSchema } from "@/lib/schema";
import { typedId } from "@/lib/typed-id";

import type { CollectionWithSchema, CreateCollectionInput } from "./_schema";
import { validateRelationTargets } from "./_util.validate-relations";
import type { Deps } from "@/deps";

/**
 * Creates a collection and its first schema version, including indexes.
 */
export const createCollection = (
	input: CreateCollectionInput,
	deps: Deps,
): ResultAsync<CollectionWithSchema, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		yield* validateCollectionSchema(input.schema);
		yield* validateRelationTargets({ schema: input.schema }, deps);

		const existing = yield* deps.DL.collection.getCollectionBySlug({
			slug: input.slug,
		});

		if (existing) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.COLLECTION_SLUG_EXISTS,
					message: "Collection slug already exists",
					status: 409,
				}),
			);
		}

		const schemaString = JSON.stringify(input.schema);
		const collectionId = typedId("collection");

		const created = yield* deps.DL.collection.createCollection(
			{
				id: collectionId,
				slug: input.slug,
				name: input.name,
				schema: schemaString,
				titleField: input.titleField ?? null,
			},
			{
				action: "collection.create",
				actor: deps.actor,
				targetId: collectionId,
				diff: null,
			},
		);

		const versionId = typedId("schema_version");

		yield* deps.DL.collection.createSchemaVersion({
			id: versionId,
			collectionId: created.id,
			schema: schemaString,
			changeDiff: null,
		});

		const indexedFields = getIndexedFields(input.schema);

		for (const field of indexedFields) {
			yield* deps.DL.contentIndex.createIndex({
				collectionId: created.id,
				field,
				schemaVersionId: versionId,
			});
		}

		const updated = yield* deps.DL.collection.updateCollectionSchema({
			id: created.id,
			schema: schemaString,
			currentSchemaVersionId: versionId,
		});

		return ok(updated);
	});
