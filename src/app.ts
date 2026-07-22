import { Scalar } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import { contextStorage } from "hono/context-storage";
import { HTTPException } from "hono/http-exception";

import { AppHTTPException, ErrorCodes, unwrapResult } from "@/lib/errors";
import { assembleOpenAPIDocument } from "@/lib/openapi";

import { auditLogRouter } from "@/routes/audit-log/_route";
import { authRouter } from "@/routes/auth/_route";
import { collectionRouter } from "@/routes/collection/_route";
import { createMcpRouter } from "@/routes/mcp/_route";
import { mediaRouter } from "@/routes/media/_route";

import { requireScopes } from "@/middleware/auth";
import { depsMiddleware } from "@/middleware/deps";
import { rateLimitMiddleware } from "@/middleware/rate-limit";

import { createRouter, type HonoVariables } from "./utils";

const app: Hono<HonoVariables> = createRouter()
	.use(contextStorage())
	.use(depsMiddleware)
	.use(rateLimitMiddleware)
	.get("/openapi.json", requireScopes("collection:read"), async (c) => {
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
	.route("/auth", authRouter)
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
