import { ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException } from "@/lib/errors";

import type { CollectionSchemaResponse, CollectionSlugParam } from "./_schema";
import { requireCollectionBySlug } from "./_util.require-collection";
import type { Deps } from "@/deps";

export const getCollectionSchemaBySlug = (
	input: CollectionSlugParam,
	deps: Deps,
): ResultAsync<CollectionSchemaResponse, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		return ok(collection.schema);
	});
