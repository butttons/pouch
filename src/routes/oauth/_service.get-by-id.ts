import { err, ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";

import type { OAuthClientIdParam, OAuthClientResponse } from "./_schema";
import type { Deps } from "@/deps";

export const getOAuthClientById = (
	input: OAuthClientIdParam,
	deps: Deps,
): ResultAsync<OAuthClientResponse, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const client = yield* deps.DL.oauthClient.getById({ clientId: input.id });

		if (!client) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.NOT_FOUND,
					message: "OAuth client not found",
					status: 404,
				}),
			);
		}

		return ok(client);
	});
