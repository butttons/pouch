import { err, ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import type { Collection, CreateCollectionInput } from "./_schema";
import { validateCollectionSchema } from "@/lib/schema";

export const createCollection = (
	input: CreateCollectionInput,
	deps: Deps,
): ResultAsync<Collection, AppHTTPException | DataLayerError> =>
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

		const created = yield* deps.DL.collection.createCollection({
			slug: input.slug,
			name: input.name,
			schema: JSON.stringify(input.schema),
			titleField: input.titleField ?? null,
		});

		return ok(created);
	});
