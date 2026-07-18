import { err, ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { getRelationTargets } from "@/lib/schema";

import type { Deps } from "@/deps";

export const validateRelationTargets = (
	input: { schema: Record<string, unknown> },
	deps: Deps,
): ResultAsync<void, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const relationTargets = getRelationTargets(input.schema);

		for (const targetSlug of relationTargets) {
			const targetCollection = yield* deps.DL.collection.getCollectionBySlug({
				slug: targetSlug,
			});

			if (!targetCollection) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.COLLECTION_SCHEMA_INVALID,
						message: `Relation target collection not found: ${targetSlug}`,
						status: 400,
					}),
				);
			}
		}

		return ok(undefined);
	});
