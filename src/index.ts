import { OAuthProvider, getOAuthApi } from "@cloudflare/workers-oauth-provider";

import app from "./app";
import { createAuthorizeHandler } from "@/routes/oauth/_authorize";

export default {
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const oauthProviderOptions = {
			apiRoute: "/mcp",
			apiHandler: app,
			authorizeEndpoint: "/authorize",
			tokenEndpoint: "/token",
			scopesSupported: ["content:read", "content:write", "schema:admin"],
			// No clientRegistrationEndpoint — no DCR. Clients are a small, explicitly
			// configured allow-list via MCP_CLIENTS env var.
			defaultHandler: {
				async fetch(req: Request, e: Env, executionCtx: ExecutionContext) {
					// For non-API requests, the OAuthProvider uses defaultHandler.
					// We need to route /authorize to our custom consent/login handler.
					const url = new URL(req.url);
					if (url.pathname === "/authorize" || url.pathname.startsWith("/authorize/")) {
						const oauthHelpers = getOAuthApi(oauthProviderOptions, e);
						const handler = createAuthorizeHandler(oauthHelpers);
						return handler.fetch(req, e, executionCtx);
					}
					// Everything else falls through to the existing Hono app.
					return app.fetch(req, e, executionCtx);
				},
			},
		};

		const oauthProvider = new OAuthProvider(oauthProviderOptions);
		return oauthProvider.fetch(request, env, ctx);
	},
} satisfies ExportedHandler<Env>;
