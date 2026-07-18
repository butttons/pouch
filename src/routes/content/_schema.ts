import { Type } from "typebox";

export const mediaObjectSchema = Type.Object(
	{
		id: Type.String({ pattern: "^med_" }),
		path: Type.String(),
	},
	{ additionalProperties: false, title: "MediaObject" },
);

export type MediaObject = Type.Static<typeof mediaObjectSchema>;

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

export type CreateContentInput = Type.Static<typeof createContentInputSchema>;

export const createContentBatchInputSchema = Type.Object(
	{
		items: Type.Array(createContentInputSchema, {
			minItems: 1,
			maxItems: 100,
		}),
	},
	{ additionalProperties: false },
);

export type CreateContentBatchInput = Type.Static<
	typeof createContentBatchInputSchema
>;

export const updateContentInputSchema = Type.Object(
	{
		data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
		status: Type.Optional(contentStatusSchema),
	},
	{ additionalProperties: false },
);

export type UpdateContentInput = Type.Static<typeof updateContentInputSchema>;

export const updateContentBatchInputSchema = Type.Object(
	{
		items: Type.Array(
			Type.Object(
				{
					id: Type.String({ pattern: "^con_" }),
					data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
					status: Type.Optional(contentStatusSchema),
				},
				{ additionalProperties: false },
			),
			{ minItems: 1, maxItems: 100 },
		),
	},
	{ additionalProperties: false },
);

export type UpdateContentBatchInput = Type.Static<
	typeof updateContentBatchInputSchema
>;

export const deleteContentBatchInputSchema = Type.Object(
	{
		ids: Type.Array(Type.String({ pattern: "^con_" }), {
			minItems: 1,
			maxItems: 100,
		}),
	},
	{ additionalProperties: false },
);

export type DeleteContentBatchInput = Type.Static<
	typeof deleteContentBatchInputSchema
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

export const contentQuerySchema = Type.Object(
	{
		limit: Type.Optional(Type.String()),
		cursor: Type.Optional(Type.String({ pattern: "^con_" })),
		resolve: Type.Optional(
			Type.Union([Type.String(), Type.Array(Type.String())]),
		),
	},
	{ additionalProperties: true },
);

export type ContentQuery = Type.Static<typeof contentQuerySchema>;

export const contentListResponseSchema = Type.Object(
	{
		data: Type.Array(contentResponseSchema),
		nextCursor: Type.Union([Type.String(), Type.Null()]),
	},
	{ additionalProperties: false },
);

export type ContentListResponse = Type.Static<typeof contentListResponseSchema>;

export const contentBatchResponseSchema = Type.Object(
	{
		data: Type.Array(contentResponseSchema),
	},
	{ additionalProperties: false },
);

export type ContentBatchResponse = Type.Static<
	typeof contentBatchResponseSchema
>;
