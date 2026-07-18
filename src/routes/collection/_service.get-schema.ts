import { ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import { AppHTTPException } from "@/lib/errors";
import { requireCollectionBySlug } from "./_util.require-collection";
import type {
	CollectionSchemaResponse,
	CollectionSlugParam,
} from "./_schema";

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
