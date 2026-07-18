import { err, ok, type Result, type ResultAsync } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import type { Deps } from "@/deps";
import type { CollectionWithSchema } from "./_schema";

export const requireCollectionBySlug = (
	input: { slug: string },
	deps: Deps,
): ResultAsync<CollectionWithSchema, AppHTTPException | DataLayerError> =>
	deps.DL.collection.getCollectionBySlug({ slug: input.slug }).andThen(
		(collection): Result<CollectionWithSchema, AppHTTPException | DataLayerError> => {
			if (!collection) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.NOT_FOUND,
						message: "Collection not found",
						status: 404,
					}),
				);
			}

			return ok(collection);
		},
	);
