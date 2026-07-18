import { ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import type { AppHTTPException } from "@/lib/errors";
import { requireCollectionBySlug } from "@/routes/collection/_util.require-collection";
import { requireContentInCollection } from "./_util.require-content";
import { normalizeResolveParam } from "./_util.normalize-resolve";
import type { Content, ContentRouteParams } from "./_schema";
import { resolveRelations } from "./_service.resolve";

export const getContentById = (
	input: ContentRouteParams & { resolve?: string | string[] },
	deps: Deps,
): ResultAsync<Content, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		const content = yield* requireContentInCollection(
			{ id: input.id, collectionId: collection.id },
			deps,
		);

		const resolve = normalizeResolveParam(input.resolve);

		if (!resolve) {
			return ok(content);
		}

		const resolved = yield* resolveRelations(
			{
				rows: [content],
				resolve,
				schema: collection.schema,
			},
			deps,
		);

		return ok(resolved[0] ?? content);
	});
