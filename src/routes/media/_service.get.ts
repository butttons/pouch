import { ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";

import type { MediaListResponse, MediaQuery } from "./_schema";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

export const listMedia = (
	input: { query: MediaQuery },
	deps: Deps,
): ResultAsync<MediaListResponse, DataLayerError> =>
	safeTry(async function* () {
		const rawLimit = input.query.limit
			? Number.parseInt(input.query.limit, 10)
			: DEFAULT_LIMIT;
		const limit = Number.isNaN(rawLimit)
			? DEFAULT_LIMIT
			: Math.min(Math.max(rawLimit, 1), MAX_LIMIT);

		const result = yield* deps.DL.media.listMedia({
			limit,
			cursor: input.query.cursor,
		});

		return ok({
			data: result.rows,
			nextCursor: result.nextCursor,
		});
	});
