import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { sign } from "hono/jwt";

import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { typedId } from "@/lib/typed-id";
import { createRouter } from "@/utils";

import type { OAuthHelpers } from "@cloudflare/workers-oauth-provider";
import type { Context } from "hono";

const SESSION_COOKIE_NAME = "mcp_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60; // 1 hour

/**
 * Parsed MCP client from the MCP_CLIENTS env var.
 */
export type McpClient = {
	client_id: string;
	redirect_uris: string[];
	name: string;
	max_scopes: string[];
};

/**
 * Parse the MCP_CLIENTS env var. Returns empty array if missing or invalid.
 */
export const parseMcpClients = (raw: string | undefined): McpClient[] => {
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(
			(c): c is McpClient =>
				typeof c === "object" &&
				c !== null &&
				typeof c.client_id === "string" &&
				Array.isArray(c.redirect_uris) &&
				c.redirect_uris.every((u: unknown) => typeof u === "string") &&
				typeof c.name === "string" &&
				Array.isArray(c.max_scopes) &&
				c.max_scopes.every((s: unknown) => typeof s === "string"),
		);
	} catch {
		return [];
	}
};

/**
 * Find a client that matches the given client_id AND redirect_uri exactly.
 * Both must match — this is the open-redirect guard.
 */
export const findAllowedClient = (
	clients: McpClient[],
	clientId: string,
	redirectUri: string,
): McpClient | undefined =>
	clients.find(
		(c) =>
			c.client_id === clientId && c.redirect_uris.includes(redirectUri),
	);

/**
 * Compute the intersection of requested scopes and the client's max_scopes.
 */
export const computeConsentScopes = (
	requestedScope: string[],
	clientMaxScopes: string[],
): string[] => {
	const maxSet = new Set(clientMaxScopes);
	return requestedScope.filter((s) => maxSet.has(s));
};

/**
 * Check if the admin session cookie is present and valid.
 */
const isAdminAuthenticated = async (c: Context): Promise<boolean> => {
	const secret = c.env.JWT_SECRET;
	const cookie = await getSignedCookie(c, secret, SESSION_COOKIE_NAME);
	return cookie === "1";
};

/**
 * Render a minimal login form for the admin passphrase.
 */
const renderLoginPage = (returnUrl: string): string => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Authorize — pouch</title></head>
<body>
<h1>Admin Login</h1>
<form method="POST" action="/authorize?login=1">
<input type="hidden" name="return_url" value="${escapeHtml(returnUrl)}" />
<label>Passphrase: <input type="password" name="passphrase" required /></label>
<button type="submit">Log in</button>
</form>
</body>
</html>`;

/**
 * Render the consent screen with checkboxes for each grantable scope.
 */
const renderConsentPage = (args: {
	clientName: string;
	scopes: string[];
	returnUrl: string;
}): string => `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Authorize — pouch</title></head>
<body>
<h1>Approve access for ${escapeHtml(args.clientName)}</h1>
<form method="POST" action="/authorize">
<input type="hidden" name="return_url" value="${escapeHtml(args.returnUrl)}" />
${args.scopes
	.map(
		(scope) =>
			`<label><input type="checkbox" name="scope" value="${escapeHtml(scope)}" checked /> ${escapeHtml(scope)}</label><br/>`,
	)
	.join("\n")}
${args.scopes.length === 0 ? "<p>No scopes requested.</p>" : ""}
<button type="submit" name="action" value="approve">Approve</button>
<button type="submit" name="action" value="deny">Deny</button>
</form>
</body>
</html>`;

const escapeHtml = (str: string): string =>
	str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");

/**
 * Build the OAuth authorize handler (Hono sub-app) that the OAuthProvider
 * uses as its defaultHandler. This handles:
 *   - GET /authorize  → login check → consent screen
 *   - POST /authorize → approve/deny → complete authorization
 *   - POST /authorize?login=1 → verify passphrase → set cookie → redirect back
 */
export const createAuthorizeHandler = (oauthHelpers: OAuthHelpers) => {
	const router = createRouter();

	// GET /authorize — show consent screen (or login if not authenticated)
	router.get("/authorize", async (c) => {
		const clients = parseMcpClients(c.env.MCP_CLIENTS);
		const url = new URL(c.req.url);
		const clientId = url.searchParams.get("client_id") ?? "";
		const redirectUri = url.searchParams.get("redirect_uri") ?? "";

		if (!clientId || !redirectUri) {
			throw new AppHTTPException({
				code: ErrorCodes.VALIDATION_FAILED,
				message: "Missing client_id or redirect_uri",
				status: 400,
			});
		}

		const client = findAllowedClient(clients, clientId, redirectUri);
		if (!client) {
			throw new AppHTTPException({
				code: ErrorCodes.UNAUTHORIZED,
				message: "Invalid client_id or redirect_uri",
				status: 400,
			});
		}

		const isAuthenticated = await isAdminAuthenticated(c);
		if (!isAuthenticated) {
			return c.html(renderLoginPage(c.req.url), 401);
		}

		// Parse requested scopes from the query param
		const requestedScope = url.searchParams.get("scope")?.split(" ").filter(Boolean) ?? [];
		const consentScopes = computeConsentScopes(requestedScope, client.max_scopes);

		return c.html(
			renderConsentPage({
				clientName: client.name,
				scopes: consentScopes,
				returnUrl: c.req.url,
			}),
		);
	});

	// POST /authorize?login=1 — verify passphrase and set session cookie
	router.post("/authorize", async (c) => {
		const url = new URL(c.req.url);
		const isLogin = url.searchParams.get("login") === "1";

		if (isLogin) {
			const body = await c.req.parseBody();
			const passphrase = body["passphrase"];
			const returnUrl = body["return_url"] ?? "/authorize";

			if (typeof passphrase !== "string" || passphrase !== c.env.MCP_ADMIN_PASSPHRASE) {
				return c.html(
					`<!DOCTYPE html><html><body><p>Invalid passphrase. <a href="${escapeHtml(String(returnUrl))}">Back</a></p></body></html>`,
					401,
				);
			}

			await setSignedCookie(c, SESSION_COOKIE_NAME, "1", c.env.JWT_SECRET, {
				httpOnly: true,
				maxAge: SESSION_MAX_AGE_SECONDS,
				path: "/",
				secure: url.protocol === "https:",
				sameSite: "Lax",
			});

			return c.redirect(String(returnUrl));
		}

		// Otherwise this is the consent form submission
		const body = await c.req.parseBody();
		const action = body["action"];
		const returnUrl = body["return_url"] ?? "/authorize";

		if (action === "deny") {
			// Parse the original auth request from the return_url so we can redirect with the proper error
			const returnUrlObj = new URL(String(returnUrl), c.req.url);
			const redirectUri = returnUrlObj.searchParams.get("redirect_uri") ?? "";
			const state = returnUrlObj.searchParams.get("state") ?? "";
			const errorUrl = new URL(redirectUri);
			errorUrl.searchParams.set("error", "access_denied");
			if (state) errorUrl.searchParams.set("state", state);
			return c.redirect(errorUrl.toString());
		}

		// Approve path
		const returnUrlObj = new URL(String(returnUrl), c.req.url);
		const authRequest = await oauthHelpers.parseAuthRequest(
			new Request(returnUrlObj.toString()),
		);

		const clients = parseMcpClients(c.env.MCP_CLIENTS);
		const client = findAllowedClient(
			clients,
			authRequest.clientId,
			authRequest.redirectUri,
		);
		if (!client) {
			throw new AppHTTPException({
				code: ErrorCodes.UNAUTHORIZED,
				message: "Invalid client",
				status: 400,
			});
		}

		// The submitted scopes are the ones that were checked on the form
		const submittedScopes =
			body["scope"]
				? Array.isArray(body["scope"])
					? (body["scope"] as string[])
					: [body["scope"] as string]
				: [];

		const grantedScopes = computeConsentScopes(submittedScopes, client.max_scopes);

		// Mint a token using the existing hono/jwt sign() with the same payload shape
		const jti = typedId("key");
		const iat = Math.floor(Date.now() / 1000);
		const exp = iat + 60 * 60 * 24 * 180; // 180 days
		const tokenPayload = { jti, name: client.name, scopes: grantedScopes, iat, exp };
		const accessToken = await sign(tokenPayload, c.env.JWT_SECRET);

		// Complete the OAuth authorization using the library's helpers
		const result = await oauthHelpers.completeAuthorization({
			request: authRequest,
			userId: jti,
			scope: grantedScopes,
			props: { accessToken },
			metadata: { clientName: client.name },
		});

		// Audit log: write in the same batch pattern used elsewhere
		const actor = jti;
		await c.var.deps.DL.auditLog.insert({
			action: "auth.oauth.grant",
			actor,
			targetId: jti,
			diff: { client: client.name, scopes: grantedScopes },
		});

		return c.redirect(result.redirectTo);
	});

	return router;
};
