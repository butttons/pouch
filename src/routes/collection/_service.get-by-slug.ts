import { ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException } from "@/lib/errors";

import type { CollectionSlugParam, CollectionWithSchema } from "./_schema";
import { requireCollectionBySlug } from "./_util.require-collection";
import type { Deps } from "@/deps";

export const getCollectionBySlug = (
	input: CollectionSlugParam,
	deps: Deps,
): ResultAsync<CollectionWithSchema, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		return ok(collection);
	});
