import { Type } from "typebox";

export const createCollectionInputSchema = Type.Object(
	{
		slug: Type.String({ minLength: 1 }),
		name: Type.String({ minLength: 1 }),
		schema: Type.Record(Type.String(), Type.Unknown()),
		titleField: Type.Optional(Type.String()),
	},
	{ additionalProperties: false },
);

export type CreateCollectionInput = Type.Static<
	typeof createCollectionInputSchema
>;

export const collectionSchema = Type.Object(
	{
		id: Type.String(),
		slug: Type.String(),
		name: Type.String(),
		titleField: Type.Union([Type.String(), Type.Null()]),
	},
	{ additionalProperties: false },
);

export type Collection = Type.Static<typeof collectionSchema>;

export const collectionWithSchemaSchema = Type.Object(
	{
		id: Type.String(),
		slug: Type.String(),
		name: Type.String(),
		titleField: Type.Union([Type.String(), Type.Null()]),
		schema: Type.Record(Type.String(), Type.Unknown()),
	},
	{ additionalProperties: false },
);

export type CollectionWithSchema = Type.Static<
	typeof collectionWithSchemaSchema
>;

export const collectionIdParamSchema = Type.Object(
	{
		id: Type.String({ pattern: "^col_" }),
	},
	{ additionalProperties: false },
);

export type CollectionIdParam = Type.Static<
	typeof collectionIdParamSchema
>;

export const deleteCollectionQuerySchema = Type.Object(
	{
		force: Type.Optional(
			Type.Union([Type.Literal("true"), Type.Literal("false")]),
		),
	},
	{ additionalProperties: false },
);

export type DeleteCollectionQuery = Type.Static<
	typeof deleteCollectionQuerySchema
>;
