import { err, ok, ResultAsync, safeTry } from "neverthrow";

import { diffIndexedFields } from "@/lib/content-index";
import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { diffCollectionSchemas, validateCollectionSchema } from "@/lib/schema";
import { typedId } from "@/lib/typed-id";

import type {
	CollectionSlugParam,
	CollectionWithSchema,
	PatchCollectionSchemaInput,
} from "./_schema";
import { requireCollectionBySlug } from "./_util.require-collection";
import { validateRelationTargets } from "./_util.validate-relations";
import type { Deps } from "@/deps";

/**
 * Validates and applies a schema patch, rebuilding indexes when fields change.
 */
export const patchCollectionSchema = (
	input: CollectionSlugParam & PatchCollectionSchemaInput,
	deps: Deps,
): ResultAsync<CollectionWithSchema, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		yield* validateCollectionSchema(input.schema);
		yield* validateRelationTargets({ schema: input.schema }, deps);

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

		const { added, removed } = diffIndexedFields(
			collection.schema,
			input.schema,
		);

		for (const field of removed) {
			yield* deps.DL.contentIndex.dropIndex({
				collectionId: collection.id,
				field,
			});
		}

		for (const field of added) {
			yield* deps.DL.contentIndex.createIndex({
				collectionId: collection.id,
				field,
				schemaVersionId: versionId,
			});
		}

		const updated = yield* deps.DL.collection.updateCollectionSchema({
			id: collection.id,
			schema: schemaString,
			currentSchemaVersionId: versionId,
		});

		return ok(updated);
	});
