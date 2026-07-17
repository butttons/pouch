import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import type { CollectionWithSchema, CreateCollectionInput } from "./_schema";
import { validateCollectionSchema } from "@/lib/schema";
import { typedId } from "@/lib/typed-id";

export const createCollection = (
	input: CreateCollectionInput,
	deps: Deps,
): ResultAsync<CollectionWithSchema, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		yield* validateCollectionSchema(input.schema);

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

		const created = yield* deps.DL.collection.createCollection({
			slug: input.slug,
			name: input.name,
			schema: schemaString,
			titleField: input.titleField ?? null,
		});

		const versionId = typedId("schema_version");

		yield* deps.DL.collection.createSchemaVersion({
			id: versionId,
			collectionId: created.id,
			schema: schemaString,
			changeDiff: null,
		});

		const updated = yield* deps.DL.collection.updateCollectionSchema({
			id: created.id,
			schema: schemaString,
			currentSchemaVersionId: versionId,
		});

		return ok(updated);
	});
