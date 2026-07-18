import { ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";

import type { MediaIdParam } from "./_schema";
import { requireMediaById } from "./_util.require-media";

export const deleteMedia = (
	input: MediaIdParam,
	deps: Deps,
): ResultAsync<void, DataLayerError | Error> =>
	safeTry(async function* () {
		const media = yield* requireMediaById({ id: input.id, DL: deps.DL });

		await deps.bucket.delete(media.r2Key);

		yield* deps.DL.media.deleteMediaById({ id: media.id });

		return ok(undefined);
	});
