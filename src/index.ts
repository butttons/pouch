import { OAuthProvider } from "@cloudflare/workers-oauth-provider";

import {
	baseOAuthProviderOptions,
	OAUTH_AUTHORIZE_ENDPOINT,
	resolveExternalPouchToken,
} from "@/lib/oauth";

import { oauthRouter } from "@/routes/oauth/_route";

import app from "./app";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const oauthProvider = new OAuthProvider({
			...baseOAuthProviderOptions,
			apiRoute: "/mcp",
			apiHandler: app,
			resolveExternalToken: ({ token }) =>
				resolveExternalPouchToken(token, env),
			defaultHandler: {
				async fetch(req: Request, e: Env, executionCtx: ExecutionContext) {
					// The OAuth consent flow is handled by its own router; everything
					// else falls through to the existing Hono app untouched.
					const url = new URL(req.url);
					if (url.pathname === OAUTH_AUTHORIZE_ENDPOINT) {
						return oauthRouter.fetch(req, e, executionCtx);
					}
					return app.fetch(req, e, executionCtx);
				},
			},
		});

		return oauthProvider.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
