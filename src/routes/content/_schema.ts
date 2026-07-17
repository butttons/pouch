import { Type } from "typebox";

export const contentStatusSchema = Type.Union([
	Type.Literal("draft"),
	Type.Literal("published"),
	Type.Literal("archived"),
]);

export const createContentInputSchema = Type.Object(
	{
		data: Type.Record(Type.String(), Type.Unknown()),
		status: Type.Optional(contentStatusSchema),
	},
	{ additionalProperties: false },
);

export type CreateContentInput = Type.Static<
	typeof createContentInputSchema
>;

export const updateContentInputSchema = Type.Object(
	{
		data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
		status: Type.Optional(contentStatusSchema),
	},
	{ additionalProperties: false },
);

export type UpdateContentInput = Type.Static<
	typeof updateContentInputSchema
>;

export const contentResponseSchema = Type.Object(
	{
		id: Type.String(),
		collectionId: Type.String(),
		data: Type.Record(Type.String(), Type.Unknown()),
		status: contentStatusSchema,
		schemaVersionId: Type.String(),
		createdAt: Type.Number(),
		updatedAt: Type.Number(),
	},
	{ additionalProperties: false },
);

export type Content = Type.Static<typeof contentResponseSchema>;

export const contentIdParamSchema = Type.Object(
	{
		id: Type.String({ pattern: "^con_" }),
	},
	{ additionalProperties: false },
);

export type ContentIdParam = Type.Static<typeof contentIdParamSchema>;

export const contentRouteParamsSchema = Type.Object(
	{
		slug: Type.String({ minLength: 1 }),
		id: Type.String({ pattern: "^con_" }),
	},
	{ additionalProperties: false },
);

export type ContentRouteParams = Type.Static<typeof contentRouteParamsSchema>;

export const contentQuerySchema = Type.Record(
	Type.String(),
	Type.Union([Type.String(), Type.Array(Type.String())]),
);

export type ContentQuery = Type.Static<typeof contentQuerySchema>;
