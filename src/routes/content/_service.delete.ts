import { ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { AppHTTPException } from "@/lib/errors";

import { requireCollectionBySlug } from "@/routes/collection/_util.require-collection";

import type { ContentRouteParams } from "./_schema";
import { requireContentInCollection } from "./_util.require-content";
import type { Deps } from "@/deps";

export const deleteContent = (
	input: ContentRouteParams,
	deps: Deps,
): ResultAsync<void, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		yield* requireContentInCollection(
			{ id: input.id, collectionId: collection.id },
			deps,
		);

		yield* deps.DL.content.deleteContentById({ id: input.id });

		return ok(undefined);
	});
