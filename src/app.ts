import { contextStorage } from "hono/context-storage";
import { HTTPException } from "hono/http-exception";
import { Hono } from "hono";
import { sign } from "hono/jwt";
import { Type } from "typebox";

import { AppHTTPException, ErrorCodes, unwrapResult } from "./lib/errors";
import { assembleOpenAPIDocument } from "./lib/openapi";
import { typedId } from "./lib/typed-id";
import { jsonValidator } from "./lib/validator";
import { depsMiddleware } from "./middleware/deps";
import { requireScopes, SCOPES } from "./middleware/auth";
import { collectionRouter } from "./routes/collection/_route";
import { createMcpRouter } from "./routes/mcp/_route";
import { createRouter, type HonoVariables } from "./utils";

const SIX_MONTHS = 60 * 60 * 24 * 180;

const createKeyInputSchema = Type.Object(
	{
		secret: Type.String({ minLength: 1 }),
		scopes: Type.Optional(
			Type.Array(Type.Union(SCOPES.map((scope) => Type.Literal(scope)))),
		),
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
			const scopes = input.scopes ?? [...SCOPES];
			const iat = Math.floor(Date.now() / 1000);
			const exp = iat + (input.expiresInSeconds ?? SIX_MONTHS);

			const token = await sign({ jti, scopes, iat, exp }, c.env.JWT_SECRET);

			return c.json({ token, jti, scopes, exp }, 201);
		},
	)
	.get(
		"/openapi.json",
		requireScopes("content:read"),
		async (c) => {
			const result = await assembleOpenAPIDocument(c.var.deps);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.route("/collections", collectionRouter)
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
	.onError((error, c) => {
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

		console.error("Request failed", {
			path: c.req.path,
			method: c.req.method,
			rayId: c.req.header("cf-ray"),
			code: normalizedError.code,
			status,
			error: normalizedError,
		});

		return c.json(normalizedError.toJSON(), status as never);
	});

app.route("/mcp", createMcpRouter(app));

export default app;
