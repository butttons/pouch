import { sign } from "hono/jwt";
import {
	err,
	ok,
	Result,
	ResultAsync,
	type ResultAsync as ResultAsyncType,
	safeTry,
} from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { getOAuthHelpers } from "@/lib/oauth";
import { typedId } from "@/lib/typed-id";

import type { Scope } from "@/middleware/auth";

import type { Deps } from "@/deps";

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 180; // 180 days

export type ConsentView =
	| { type: "login"; clientName: string; returnUrl: string }
	| { type: "consent"; clientName: string; scopes: Scope[]; returnUrl: string };

const computeGrantedScopes = (
	requested: string[],
	maxScopes: Scope[],
): Scope[] => {
	const maxSet = new Set<string>(maxScopes);
	return requested.filter((scope): scope is Scope => maxSet.has(scope));
};

const invalidRequest = (message: string, cause?: unknown) =>
	new AppHTTPException({
		code: ErrorCodes.VALIDATION_FAILED,
		message,
		status: 400,
		cause,
	});

const parseUrl = (raw: string) =>
	Result.fromThrowable(
		() => new URL(raw),
		(error) => invalidRequest("Invalid URL", error),
	)();

/**
 * Prepares the GET /authorize view: validates the client against the KV
 * registry (client_id AND redirect_uri must match — the open-redirect guard),
 * then returns either the login view or the consent view with the scope
 * intersection (requested ∩ client.maxScopes).
 */
export const prepareConsent = (
	input: { requestUrl: string; isAuthenticated: boolean },
	deps: Deps,
): ResultAsyncType<ConsentView, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const url = yield* parseUrl(input.requestUrl);
		const clientId = url.searchParams.get("client_id") ?? "";
		const redirectUri = url.searchParams.get("redirect_uri") ?? "";

		if (!clientId || !redirectUri) {
			return err(invalidRequest("Missing client_id or redirect_uri"));
		}

		const client = yield* deps.DL.oauthClient.getById({ clientId });
		const isAllowed =
			client !== null && client.redirectUris.includes(redirectUri);

		if (!isAllowed) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.UNAUTHORIZED,
					message: "Invalid client_id or redirect_uri",
					status: 400,
				}),
			);
		}

		if (!input.isAuthenticated) {
			return ok({
				type: "login" as const,
				clientName: client.name,
				returnUrl: input.requestUrl,
			});
		}

		const requested =
			url.searchParams.get("scope")?.split(" ").filter(Boolean) ?? [];

		return ok({
			type: "consent" as const,
			clientName: client.name,
			scopes: computeGrantedScopes(requested, client.maxScopes),
			returnUrl: input.requestUrl,
		});
	});

/**
 * Completes the POST /authorize consent submission. On deny, redirects back to
 * the client with access_denied. On approve, mints a standard pouch JWT (same
 * payload shape as /auth/keys) and completes the library's authorization flow.
 */
export const completeConsent = (
	input: {
		action: string;
		returnUrl: string;
		submittedScopes: string[];
	},
	deps: Deps,
): ResultAsyncType<{ redirectTo: string }, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const helpers = getOAuthHelpers(deps.env);
		const returnUrlObj = yield* parseUrl(input.returnUrl);

		if (input.action === "deny") {
			const redirectUri = returnUrlObj.searchParams.get("redirect_uri") ?? "";
			const state = returnUrlObj.searchParams.get("state") ?? "";
			const errorUrl = yield* parseUrl(redirectUri);
			errorUrl.searchParams.set("error", "access_denied");
			if (state) errorUrl.searchParams.set("state", state);
			return ok({ redirectTo: errorUrl.toString() });
		}

		const authRequest = yield* ResultAsync.fromPromise(
			helpers.parseAuthRequest(new Request(returnUrlObj.toString())),
			(error) =>
				invalidRequest(
					error instanceof Error
						? error.message
						: "Invalid authorization request",
					error,
				),
		);

		const client = yield* deps.DL.oauthClient.getById({
			clientId: authRequest.clientId,
		});
		const isAllowed =
			client !== null && client.redirectUris.includes(authRequest.redirectUri);

		if (!isAllowed) {
			return err(
				new AppHTTPException({
					code: ErrorCodes.UNAUTHORIZED,
					message: "Invalid client",
					status: 400,
				}),
			);
		}

		const grantedScopes = computeGrantedScopes(
			input.submittedScopes,
			client.maxScopes,
		);

		const jti = typedId("key");
		const iat = Math.floor(Date.now() / 1000);
		const accessToken = yield* ResultAsync.fromPromise(
			sign(
				{
					jti,
					name: client.name,
					scopes: grantedScopes,
					iat,
					exp: iat + TOKEN_TTL_SECONDS,
				},
				deps.env.JWT_SECRET,
			),
			(error) =>
				new AppHTTPException({
					code: ErrorCodes.INTERNAL_ERROR,
					message: "Failed to mint access token",
					status: 500,
					cause: error,
				}),
		);

		const result = yield* ResultAsync.fromPromise(
			helpers.completeAuthorization({
				request: authRequest,
				userId: jti,
				scope: grantedScopes,
				props: { accessToken },
				metadata: { clientName: client.name },
			}),
			(error) =>
				new AppHTTPException({
					code: ErrorCodes.INTERNAL_ERROR,
					message:
						error instanceof Error
							? error.message
							: "Failed to complete authorization",
					status: 500,
					cause: error,
				}),
		);

		yield* deps.DL.auditLog.insert({
			action: "auth.oauth.grant",
			actor: jti,
			targetId: jti,
			diff: { client: client.name, scopes: grantedScopes },
		});

		return ok({ redirectTo: result.redirectTo });
	});
