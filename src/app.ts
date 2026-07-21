import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { contextStorage } from "hono/context-storage";
import { HTTPException } from "hono/http-exception";
import { sign } from "hono/jwt";
import { Type } from "typebox";

import { AppHTTPException, ErrorCodes, unwrapResult } from "@/lib/errors";
import { assembleOpenAPIDocument } from "@/lib/openapi";
import { typedId } from "@/lib/typed-id";
import { jsonValidator } from "@/lib/validator";

import { auditLogRouter } from "@/routes/audit-log/_route";
import { collectionRouter } from "@/routes/collection/_route";
import { createMcpRouter } from "@/routes/mcp/_route";
import { mediaRouter } from "@/routes/media/_route";

import { requireScopes, SCOPES } from "@/middleware/auth";
import { depsMiddleware } from "@/middleware/deps";

import { createRouter, type HonoVariables } from "./utils";

const SIX_MONTHS = 60 * 60 * 24 * 180;

const createKeyInputSchema = Type.Object(
	{
		secret: Type.String({ minLength: 1 }),
		name: Type.String({ minLength: 1 }),
		scopes: Type.Array(Type.Union(SCOPES.map((scope) => Type.Literal(scope))), {
			minItems: 1,
		}),
		expiresInSeconds: Type.Optional(Type.Number({ minimum: 60 })),
	},
	{ additionalProperties: false },
);

type CreateKeyInput = Type.Static<typeof createKeyInputSchema>;

const app: Hono<HonoVariables> = createRouter()
	.use(contextStorage())
	.use(depsMiddleware)
	.post(
		"/auth/keys",
		jsonValidator<CreateKeyInput>(createKeyInputSchema),
		async (c) => {
			const input = c.req.valid("json");

			if (input.secret !== c.env.JWT_SECRET) {
				throw new AppHTTPException({
					code: ErrorCodes.UNAUTHORIZED,
					message: "Invalid secret",
					status: 401,
				});
			}

			const jti = typedId("key");
			const scopes = input.scopes;
			const iat = Math.floor(Date.now() / 1000);
			const exp = iat + (input.expiresInSeconds ?? SIX_MONTHS);
			const name = input.name;

			const token = await sign(
				{ jti, name, scopes, iat, exp },
				c.env.JWT_SECRET,
			);

			await c.var.deps.DL.auditLog.insert({
				action: "key.create",
				actor: c.var.deps.actor,
				targetId: jti,
				diff: { name, scopes },
			});

			return c.json({ token, jti, name, scopes, exp }, 201);
		},
	)
	.get("/openapi.json", requireScopes("content:read"), async (c) => {
		const url = new URL(c.req.url);
		const baseUrl = `${url.protocol}//${url.host}`;
		const result = await assembleOpenAPIDocument(c.var.deps, baseUrl);
		const value = unwrapResult(result);
		return c.json(value);
	})
	.get(
		"/docs",
		basicAuth({
			verifyUser: (username, password, c) =>
				username === "pouch" && password === c.env.DOCS_SECRET,
		}),
		Scalar<HonoVariables>(async (c) => {
			const url = new URL(c.req.url);
			const baseUrl = `${url.protocol}//${url.host}`;
			const result = await assembleOpenAPIDocument(c.var.deps, baseUrl);
			const value = unwrapResult(result);
			return {
				content: value,
				theme: "default",
				pageTitle: "pouch API docs",
				hideDownloadButton: false,
			};
		}),
	)
	.route("/collections", collectionRouter)
	.route("/media", mediaRouter)
	.route("/audit-logs", auditLogRouter)
	.notFound((c) =>
		c.json(
			{
				code: ErrorCodes.NOT_FOUND,
				message: "Not found",
				status: 404,
			},
			404,
		),
	)
	.onError(async (error, c) => {
		// Preserve HTTPException responses (e.g. Basic Auth 401 with WWW-Authenticate)
		// so browsers can prompt for credentials instead of rendering our JSON error.
		if (error instanceof HTTPException && error.res) {
			console.error("Request failed", {
				path: c.req.path,
				method: c.req.method,
				rayId: c.req.header("cf-ray"),
				status: error.status,
				message: error.message,
			});

			return error.res;
		}

		const status = error instanceof HTTPException ? error.status : 500;

		const normalizedError =
			error instanceof AppHTTPException
				? error
				: new AppHTTPException({
						cause: error,
						message: error.message ?? "Unknown error",
						code: ErrorCodes.INTERNAL_ERROR,
						status,
					});

		const logPayload: Record<string, unknown> = {
			path: c.req.path,
			method: c.req.method,
			rayId: c.req.header("cf-ray"),
			code: normalizedError.code,
			status,
			message: normalizedError.message,
		};

		if (error instanceof HTTPException && error.res) {
			logPayload.responseBody = await error.res
				.clone()
				.text()
				.catch(() => "<failed to read response body>");
		}

		if (normalizedError.cause instanceof Error) {
			logPayload.cause = {
				name: normalizedError.cause.name,
				message: normalizedError.cause.message,
				stack: normalizedError.cause.stack,
			};
		}

		console.error("Request failed", logPayload);

		return c.json(normalizedError.toJSON(), status as never);
	});

app.route("/mcp", createMcpRouter(app));

export default app;
