import { ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";

import type { Media, MediaIdParam } from "./_schema";
import { requireMediaById } from "./_util.require-media";
import type { Deps } from "@/deps";

export const getMediaById = (
	input: MediaIdParam,
	deps: Deps,
): ResultAsync<Media, DataLayerError | Error> =>
	safeTry(async function* () {
		const media = yield* requireMediaById({ id: input.id, DL: deps.DL });
		return ok(media);
	});
