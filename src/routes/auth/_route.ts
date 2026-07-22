import { sign } from "hono/jwt";
import { Type } from "typebox";

import { AppHTTPException, ErrorCodes } from "@/lib/errors";
import { typedId } from "@/lib/typed-id";
import { jsonValidator } from "@/lib/validator";

import { SCOPES } from "@/middleware/auth";
import { createRouter } from "@/utils";

const SIX_MONTHS = 60 * 60 * 24 * 180;

const createKeyInputSchema = Type.Object(
	{
		secret: Type.String({ minLength: 1 }),
		name: Type.String({ minLength: 1 }),
		scopes: Type.Array(Type.Union(SCOPES.map((scope) => Type.Literal(scope))), {
			minItems: 1,
		}),
		collections: Type.Optional(
			Type.Array(Type.String({ minLength: 1 }), { minItems: 1 }),
		),
		expiresInSeconds: Type.Optional(Type.Number({ minimum: 60 })),
	},
	{ additionalProperties: false },
);

type CreateKeyInput = Type.Static<typeof createKeyInputSchema>;

export const authRouter = createRouter().post(
	"/keys",
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
		const collections = input.collections;
		const iat = Math.floor(Date.now() / 1000);
		const exp = iat + (input.expiresInSeconds ?? SIX_MONTHS);
		const name = input.name;

		const token = await sign(
			{
				jti,
				name,
				scopes,
				...(collections ? { collections } : {}),
				iat,
				exp,
			},
			c.env.JWT_SECRET,
		);

		await c.var.deps.DL.auditLog.insert({
			action: "key.create",
			actor: c.var.deps.actor,
			targetId: jti,
			diff: { name, scopes, ...(collections ? { collections } : {}) },
		});

		return c.json(
			{
				token,
				jti,
				name,
				scopes,
				...(collections ? { collections } : {}),
				exp,
			},
			201,
		);
	},
);
