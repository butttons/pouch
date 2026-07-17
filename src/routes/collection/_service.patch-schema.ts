import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { typedId } from "@/lib/typed-id";
import {
	 diffCollectionSchemas,
	 getRelationTargets,
	 validateCollectionSchema,
} from "@/lib/schema";
import type {
	CollectionSlugParam,
	CollectionWithSchema,
	PatchCollectionSchemaInput,
} from "./_schema";

export const patchCollectionSchema = (
	input: CollectionSlugParam & PatchCollectionSchemaInput,
	deps: Deps,
): ResultAsync<CollectionWithSchema, AppHTTPException | DataLayerError> =>
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

		yield* validateCollectionSchema(input.schema);

		const relationTargets = getRelationTargets(input.schema);

		for (const targetSlug of relationTargets) {
			const targetCollection = yield* deps.DL.collection.getCollectionBySlug({
				slug: targetSlug,
			});

			if (!targetCollection) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
						message: `Relation target collection not found: ${targetSlug}`,
						status: 400,
					}),
				);
			}
		}

		const { diff, destructiveChanges } = yield* diffCollectionSchemas(
			collection.schema,
			input.schema,
		);

		if (destructiveChanges.length > 0 && !input.force) {
			const details = destructiveChanges
				.map((key) => `${key} (removed or type changed)`)
				.join(", ");

			return err(
				new AppHTTPException({
					code: ErrorCodes.COLLECTION_SCHEMA_FORCE_REQUIRED,
					message: `Destructive schema changes require force=true: ${details}`,
					status: 409,
				}),
			);
		}

		const versionId = typedId("schema_version");
		const schemaString = JSON.stringify(input.schema);

		yield* deps.DL.collection.createSchemaVersion({
			id: versionId,
			collectionId: collection.id,
			schema: schemaString,
			changeDiff: JSON.stringify(diff),
		});

		const updated = yield* deps.DL.collection.updateCollectionSchema({
			id: collection.id,
			schema: schemaString,
			currentSchemaVersionId: versionId,
		});

		return ok(updated);
	});
