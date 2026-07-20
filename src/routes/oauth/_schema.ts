import { Type } from "typebox";

import { SCOPES } from "@/middleware/auth";

const scopeSchema = Type.Union(SCOPES.map((scope) => Type.Literal(scope)));

const redirectUrisSchema = Type.Array(Type.String({ minLength: 1 }), {
	minItems: 1,
	maxItems: 10,
});

export const createOAuthClientInputSchema = Type.Object(
	{
		clientId: Type.Optional(
			Type.String({
				minLength: 1,
				maxLength: 128,
				pattern: "^[a-zA-Z0-9_-]+$",
				description:
					"Caller-supplied client ID. Falls back to a generated `ocl_` ID when omitted.",
			}),
		),
		name: Type.String({ minLength: 1, maxLength: 128 }),
		redirectUris: redirectUrisSchema,
		maxScopes: Type.Array(scopeSchema, { minItems: 1 }),
	},
	{ additionalProperties: false },
);

export type CreateOAuthClientInput = Type.Static<
	typeof createOAuthClientInputSchema
>;

export const updateOAuthClientInputSchema = Type.Object(
	{
		name: Type.Optional(Type.String({ minLength: 1, maxLength: 128 })),
		redirectUris: Type.Optional(redirectUrisSchema),
		maxScopes: Type.Optional(Type.Array(scopeSchema, { minItems: 1 })),
	},
	{ additionalProperties: false },
);

export type UpdateOAuthClientInput = Type.Static<
	typeof updateOAuthClientInputSchema
>;

export const oauthClientIdParamSchema = Type.Object(
	{
		id: Type.String({ minLength: 1 }),
	},
	{ additionalProperties: false },
);

export type OAuthClientIdParam = Type.Static<typeof oauthClientIdParamSchema>;

export const oauthClientListQuerySchema = Type.Object(
	{
		limit: Type.Optional(Type.String()),
		cursor: Type.Optional(Type.String()),
	},
	{ additionalProperties: true },
);

export type OAuthClientListQuery = Type.Static<
	typeof oauthClientListQuerySchema
>;

export const oauthClientResponseSchema = Type.Object(
	{
		clientId: Type.String(),
		name: Type.String(),
		redirectUris: Type.Array(Type.String()),
		maxScopes: Type.Array(Type.String()),
		registeredAt: Type.Union([Type.Number(), Type.Null()]),
	},
	{ additionalProperties: false },
);

export type OAuthClientResponse = Type.Static<typeof oauthClientResponseSchema>;

export const oauthClientListResponseSchema = Type.Object(
	{
		data: Type.Array(oauthClientResponseSchema),
		nextCursor: Type.Union([Type.String(), Type.Null()]),
	},
	{ additionalProperties: false },
);

export type OAuthClientListResponse = Type.Static<
	typeof oauthClientListResponseSchema
>;
