import { ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { AppHTTPException } from "@/lib/errors";
import { enrichMediaPaths } from "@/lib/schema";

import { requireCollectionBySlug } from "@/routes/collection/_util.require-collection";

import type { Content, ContentRouteParams } from "./_schema";
import { resolveRelations } from "./_service.resolve";
import { normalizeResolveParam } from "./_util.normalize-resolve";
import { requireContentInCollection } from "./_util.require-content";
import type { Deps } from "@/deps";

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

		const enrichedContent = {
			...content,
			data: enrichMediaPaths({
				data: content.data,
				schema: collection.schema,
				mediaPublicUrl: deps.mediaPublicUrl,
			}),
		};

		const resolve = normalizeResolveParam(input.resolve);

		if (!resolve) {
			return ok(enrichedContent);
		}

		const resolved = yield* resolveRelations(
			{
				rows: [enrichedContent],
				resolve,
				schema: collection.schema,
			},
			deps,
		);

		return ok(resolved[0] ?? enrichedContent);
	});
