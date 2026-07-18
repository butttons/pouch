import { ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { AppHTTPException } from "@/lib/errors";

import { requireCollectionBySlug } from "@/routes/collection/_util.require-collection";

import type {
	Content,
	ContentRouteParams,
	UpdateContentInput,
} from "./_schema";
import { enrichMediaPaths } from "@/lib/schema";

import { requireContentInCollection } from "./_util.require-content";
import {
	validateContentOrFail,
	validateMediaFieldsOrFail,
} from "./_util.validate-content";
import type { Deps } from "@/deps";

/**
 * Merges new data into existing content and validates it against the collection schema.
 */
export const updateContent = (
	input: ContentRouteParams & UpdateContentInput,
	deps: Deps,
): ResultAsync<Content, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		const existing = yield* requireContentInCollection(
			{ id: input.id, collectionId: collection.id },
			deps,
		);

		const mergedData = input.data
			? { ...existing.data, ...input.data }
			: existing.data;

		yield* validateContentOrFail({
			data: mergedData,
			schema: collection.schema,
		});
		yield* validateMediaFieldsOrFail({
			data: mergedData,
			schema: collection.schema,
			DL: deps.DL,
		});

		const updated = yield* deps.DL.content.updateContent(
			{
				id: input.id,
				data: JSON.stringify(mergedData),
				status: input.status,
			},
			{
				action: "content.update",
				actor: deps.actor,
				targetId: input.id,
				diff: { before: existing.data, after: mergedData },
			},
		);

		const enrichedData = enrichMediaPaths({
			data: updated.data,
			schema: collection.schema,
			mediaPublicUrl: deps.mediaPublicUrl,
		});

		return ok({ ...updated, data: enrichedData });
	});
