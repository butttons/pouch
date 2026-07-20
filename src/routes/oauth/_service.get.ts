import { ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";

import type { OAuthClientListQuery, OAuthClientListResponse } from "./_schema";
import type { Deps } from "@/deps";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export const listOAuthClients = (
	input: { query: OAuthClientListQuery },
	deps: Deps,
): ResultAsync<OAuthClientListResponse, DataLayerError> =>
	safeTry(async function* () {
		const rawLimit = input.query.limit
			? Number.parseInt(input.query.limit, 10)
			: DEFAULT_LIMIT;
		const limit = Number.isNaN(rawLimit)
			? DEFAULT_LIMIT
			: Math.min(Math.max(rawLimit, 1), MAX_LIMIT);

		const result = yield* deps.DL.oauthClient.list({
			limit,
			cursor: input.query.cursor,
		});

		return ok({
			data: result.items,
			nextCursor: result.nextCursor,
		});
	});
