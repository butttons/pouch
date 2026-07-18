import { err, ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";

import type { MediaIdParam } from "./_schema";
import { requireMediaById } from "./_util.require-media";
import type { Deps } from "@/deps";

export const deleteMedia = (
	input: MediaIdParam,
	deps: Deps,
): ResultAsync<void, DataLayerError | Error | AppHTTPException> =>
	safeTry(async function* () {
		const media = yield* requireMediaById({ id: input.id, DL: deps.DL });

		const usage = yield* deps.DL.content.countContentByMediaId({
			mediaId: media.id,
		});

		if ((usage?.count ?? 0) > 0) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.MEDIA_IN_USE,
					message: "Media is referenced by content and cannot be deleted",
					status: 409,
				}),
			);
		}

		await deps.bucket.delete(media.r2Key);

		yield* deps.DL.media.deleteMediaById({ id: media.id });

		return ok(undefined);
	});
