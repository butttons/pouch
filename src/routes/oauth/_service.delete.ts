import { err, ok, type ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";

import type { OAuthClientIdParam } from "./_schema";
import type { Deps } from "@/deps";

export const deleteOAuthClient = (
	input: OAuthClientIdParam,
	deps: Deps,
): ResultAsync<null, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const existing = yield* deps.DL.oauthClient.getById({ clientId: input.id });

		if (!existing) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.NOT_FOUND,
					message: "OAuth client not found",
					status: 404,
				}),
			);
		}

		yield* deps.DL.oauthClient.delete({ clientId: input.id });

		yield* deps.DL.auditLog.insert({
			action: "auth.oauth.client.delete",
			actor: deps.actor,
			targetId: input.id,
			diff: { name: existing.name },
		});

		return ok(null);
	});
