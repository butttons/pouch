import { err, ok, type Result, type ResultAsync } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import type { Deps } from "@/deps";
import type { Content } from "./_schema";

export const requireContentInCollection = (
	input: { id: string; collectionId: string },
	deps: Deps,
): ResultAsync<Content, AppHTTPException | DataLayerError> =>
	deps.DL.content.getContentById({ id: input.id }).andThen(
		(existing): Result<Content, AppHTTPException | DataLayerError> => {
			if (!existing || existing.collectionId !== input.collectionId) {
				return err(
					new AppHTTPException({
						code: ErrorCodes.NOT_FOUND,
						message: "Content not found",
						status: 404,
					}),
				);
			}

			return ok(existing);
		},
	);
