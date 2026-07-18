import { Type } from "typebox";

export const mediaIdParamSchema = Type.Object(
	{
		id: Type.String({ pattern: "^med_" }),
	},
	{ additionalProperties: false },
);

export type MediaIdParam = Type.Static<typeof mediaIdParamSchema>;

export const mediaQuerySchema = Type.Object(
	{
		limit: Type.Optional(Type.String()),
		cursor: Type.Optional(Type.String({ pattern: "^med_" })),
	},
	{ additionalProperties: true },
);

export type MediaQuery = Type.Static<typeof mediaQuerySchema>;

export const mediaResponseSchema = Type.Object(
	{
		id: Type.String(),
		r2Key: Type.String(),
		filename: Type.String(),
		mimeType: Type.String(),
		sizeBytes: Type.Number(),
		status: Type.String(),
		createdAt: Type.Number(),
		updatedAt: Type.Number(),
	},
	{ additionalProperties: false },
);

export type Media = Type.Static<typeof mediaResponseSchema>;

export const mediaListResponseSchema = Type.Object(
	{
		data: Type.Array(mediaResponseSchema),
		nextCursor: Type.Union([Type.String(), Type.Null()]),
	},
	{ additionalProperties: false },
);

export type MediaListResponse = Type.Static<typeof mediaListResponseSchema>;
