import { err, ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";

import type {
	OAuthClientIdParam,
	OAuthClientResponse,
	UpdateOAuthClientInput,
} from "./_schema";
import type { Deps } from "@/deps";

export const updateOAuthClient = (
	input: OAuthClientIdParam & UpdateOAuthClientInput,
	deps: Deps,
): ResultAsync<OAuthClientResponse, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const updated = yield* deps.DL.oauthClient.update({
			clientId: input.id,
			name: input.name,
			redirectUris: input.redirectUris,
			maxScopes: input.maxScopes,
		});

		if (!updated) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.NOT_FOUND,
					message: "OAuth client not found",
					status: 404,
				}),
			);
		}

		yield* deps.DL.auditLog.insert({
			action: "auth.oauth.client.update",
			actor: deps.actor,
			targetId: input.id,
			diff: {
				name: input.name ?? null,
				redirectUris: input.redirectUris ?? null,
				maxScopes: input.maxScopes ?? null,
			},
		});

		return ok(updated);
	});
