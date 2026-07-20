import type { Context } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { Result } from "neverthrow";

import { unwrapResult } from "@/lib/errors";
import { jsonValidator, paramValidator, queryValidator } from "@/lib/validator";

import { requireScopes } from "@/middleware/auth";
import { depsMiddleware } from "@/middleware/deps";
import { createRouter } from "@/utils";

import { ConsentPage } from "./_page.Consent";
import { LoginPage } from "./_page.Login";
import {
	type CreateOAuthClientInput,
	createOAuthClientInputSchema,
	type OAuthClientIdParam,
	type OAuthClientListQuery,
	oauthClientIdParamSchema,
	oauthClientListQuerySchema,
	type UpdateOAuthClientInput,
	updateOAuthClientInputSchema,
} from "./_schema";
import { completeConsent, prepareConsent } from "./_service.authorize";
import { deleteOAuthClient } from "./_service.delete";
import { listOAuthClients } from "./_service.get";
import { getOAuthClientById } from "./_service.get-by-id";
import { updateOAuthClient } from "./_service.patch";
import { createOAuthClient } from "./_service.post";

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
		await c.var.deps.DL.oauthClient.getById({ clientId })
	).unwrapOr(null);
	return client?.name;
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

/**
 * OAuth client registry CRUD. Mounted on the main app at /oauth/clients.
 * JWT-protected — this is operator/agent-managed registration, not open DCR.
 */
export const oauthClientsRouter = createRouter()
	.get(
		"/",
		requireScopes("schema:admin"),
		queryValidator<OAuthClientListQuery>(oauthClientListQuerySchema),
		async (c) => {
			const query = c.req.valid("query");
			const result = await listOAuthClients({ query }, c.var.deps);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.post(
		"/",
		requireScopes("schema:admin"),
		jsonValidator<CreateOAuthClientInput>(createOAuthClientInputSchema),
		async (c) => {
			const input = c.req.valid("json");
			const result = await createOAuthClient(input, c.var.deps);
			const value = unwrapResult(result);
			return c.json(value, 201);
		},
	)
	.get(
		"/:id",
		requireScopes("schema:admin"),
		paramValidator<OAuthClientIdParam>(oauthClientIdParamSchema),
		async (c) => {
			const params = c.req.valid("param");
			const result = await getOAuthClientById(params, c.var.deps);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.patch(
		"/:id",
		requireScopes("schema:admin"),
		paramValidator<OAuthClientIdParam>(oauthClientIdParamSchema),
		jsonValidator<UpdateOAuthClientInput>(updateOAuthClientInputSchema),
		async (c) => {
			const params = c.req.valid("param");
			const body = c.req.valid("json");
			const result = await updateOAuthClient(
				{ ...params, ...body },
				c.var.deps,
			);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.delete(
		"/:id",
		requireScopes("schema:admin"),
		paramValidator<OAuthClientIdParam>(oauthClientIdParamSchema),
		async (c) => {
			const params = c.req.valid("param");
			const result = await deleteOAuthClient(params, c.var.deps);
			unwrapResult(result);
			return c.body(null, 204);
		},
	);
