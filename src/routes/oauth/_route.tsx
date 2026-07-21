import type { Context } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { Result, ResultAsync } from "neverthrow";

import { unwrapResult } from "@/lib/errors";
import { getOAuthHelpers } from "@/lib/oauth";

import { depsMiddleware } from "@/middleware/deps";
import { createRouter } from "@/utils";

import { ConsentPage } from "./_page.Consent";
import { LoginPage } from "./_page.Login";
import { completeConsent, prepareConsent } from "./_service.authorize";

const SESSION_COOKIE_NAME = "mcp_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60; // 1 hour

const isAdminAuthenticated = async (c: Context): Promise<boolean> => {
	const cookie = await getSignedCookie(
		c,
		c.env.JWT_SECRET,
		SESSION_COOKIE_NAME,
	);
	return cookie === "1";
};

const parseScopes = (form: FormData): string[] =>
	form.getAll("scope").map(String);

/**
 * Best-effort lookup of the client name embedded in an authorize URL, so the
 * login error state can keep showing the client chip. Falls back to undefined
 * when the URL or client cannot be resolved.
 */
const resolveClientName = async (
	c: Context,
	returnUrl: string,
): Promise<string | undefined> => {
	const clientId = Result.fromThrowable(
		() => new URL(returnUrl).searchParams.get("client_id") ?? "",
		() => "",
	)().unwrapOr("");
	if (!clientId) return undefined;
	const client = (
		await ResultAsync.fromPromise(
			getOAuthHelpers(c.env).lookupClient(clientId),
			() => null,
		)
	).unwrapOr(null);
	return client?.clientName ?? undefined;
};

/**
 * Browser-facing OAuth consent flow. Mounted by the OAuthProvider
 * defaultHandler in src/index.ts — runs outside the main app pipeline, so it
 * applies depsMiddleware itself.
 */
export const oauthRouter = createRouter()
	.use(depsMiddleware)
	.get("/authorize", async (c) => {
		const isAuthenticated = await isAdminAuthenticated(c);
		const result = await prepareConsent(
			{ requestUrl: c.req.url, isAuthenticated },
			c.var.deps,
		);
		const view = unwrapResult(result);

		if (view.type === "login") {
			return c.html(
				<LoginPage clientName={view.clientName} returnUrl={view.returnUrl} />,
				401,
			);
		}

		return c.html(
			<ConsentPage
				clientName={view.clientName}
				scopes={view.scopes}
				returnUrl={view.returnUrl}
			/>,
		);
	})
	.post("/authorize", async (c) => {
		const url = new URL(c.req.url);
		const isLogin = url.searchParams.get("login") === "1";
		const form = await c.req.formData();

		if (isLogin) {
			const passphrase = form.get("passphrase");
			const returnUrl = String(form.get("return_url") ?? "/authorize");

			if (
				typeof passphrase !== "string" ||
				passphrase !== c.env.MCP_ADMIN_PASSPHRASE
			) {
				const clientName = await resolveClientName(c, returnUrl);
				return c.html(
					<LoginPage returnUrl={returnUrl} clientName={clientName} hasError />,
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

			return c.redirect(returnUrl);
		}

		const result = await completeConsent(
			{
				action: String(form.get("action") ?? ""),
				returnUrl: String(form.get("return_url") ?? ""),
				submittedScopes: parseScopes(form),
			},
			c.var.deps,
		);
		const { redirectTo } = unwrapResult(result);
		return c.redirect(redirectTo);
	});
