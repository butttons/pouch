import { err, ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { typedId } from "@/lib/typed-id";

import type { CreateOAuthClientInput, OAuthClientResponse } from "./_schema";
import type { Deps } from "@/deps";

/**
 * Registers a new OAuth client in the KV registry. Uses the caller-supplied
 * clientId when present, otherwise falls back to a generated `ocl_` ID.
 */
export const createOAuthClient = (
	input: CreateOAuthClientInput,
	deps: Deps,
): ResultAsync<OAuthClientResponse, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const clientId = input.clientId ?? typedId("oauth_client");

		const existing = yield* deps.DL.oauthClient.getById({ clientId });
		if (existing) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.OAUTH_CLIENT_EXISTS,
					message: "OAuth client already exists",
					status: 409,
				}),
			);
		}

		const created = yield* deps.DL.oauthClient.create({
			clientId,
			name: input.name,
			redirectUris: input.redirectUris,
			maxScopes: input.maxScopes,
			actor: deps.actor,
		});

		yield* deps.DL.auditLog.insert({
			action: "auth.oauth.client.create",
			actor: deps.actor,
			targetId: clientId,
			diff: {
				name: input.name,
				redirectUris: input.redirectUris,
				maxScopes: input.maxScopes,
			},
		});

		return ok(created);
	});
