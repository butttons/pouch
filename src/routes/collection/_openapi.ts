import { errorResponse, withOperation } from "@/lib/openapi-helpers";

import {
	collectionSchema,
	collectionSchemaResponseSchema,
	collectionWithSchemaSchema,
	createCollectionInputSchema,
	patchCollectionSchemaInputSchema,
} from "./_schema";

export const SYSTEM_SCHEMA_PREFIX = "__";

export const collectionSchemaRef = `${SYSTEM_SCHEMA_PREFIX}Collection`;
export const collectionWithSchemaSchemaRef = `${SYSTEM_SCHEMA_PREFIX}CollectionWithSchema`;
export const createCollectionInputSchemaRef = `${SYSTEM_SCHEMA_PREFIX}CreateCollectionInput`;
export const collectionSchemaResponseRef = `${SYSTEM_SCHEMA_PREFIX}CollectionSchema`;
export const patchCollectionSchemaInputSchemaRef = `${SYSTEM_SCHEMA_PREFIX}PatchCollectionSchemaInput`;

export const collectionSchemas = {
	[collectionSchemaRef]: collectionSchema,
	[collectionWithSchemaSchemaRef]: collectionWithSchemaSchema,
	[createCollectionInputSchemaRef]: createCollectionInputSchema,
	[collectionSchemaResponseRef]: collectionSchemaResponseSchema,
	[patchCollectionSchemaInputSchemaRef]: patchCollectionSchemaInputSchema,
};

const collectionTags = ["Collections"];

export const collectionPaths = {
	"/collections": {
		get: withOperation(
			{
				summary: "List collections",
				operationId: "listCollections",
				tags: collectionTags,
				security: [{ bearerAuth: [] }],
				responses: {
					"200": {
						description: "List of collections",
						content: {
							"application/json": {
								schema: {
									type: "array",
									items: {
										$ref: `#/components/schemas/${collectionSchemaRef}`,
									},
								},
							},
						},
					},
				},
			},
			["content:read"],
		),
		post: withOperation(
			{
				summary: "Create collection",
				operationId: "createCollection",
				tags: collectionTags,
				security: [{ bearerAuth: [] }],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								$ref: `#/components/schemas/${createCollectionInputSchemaRef}`,
							},
						},
					},
				},
				responses: {
					"201": {
						description: "Created collection",
						content: {
							"application/json": {
								schema: {
									$ref: `#/components/schemas/${collectionSchemaRef}`,
								},
							},
						},
					},
					"409": errorResponse(409, "Collection slug already exists"),
					"400": errorResponse(400, "Schema must be an object"),
				},
			},
			["schema:admin"],
		),
	},
	"/collections/{slug}/schema": {
		get: withOperation(
			{
				summary: "Get collection schema",
				description: "Returns the current JSON Schema for a collection.",
				operationId: "getCollectionSchemaBySlug",
				tags: collectionTags,
				security: [{ bearerAuth: [] }],
				parameters: [
					{
						name: "slug",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": {
						description: "Collection schema",
						content: {
							"application/json": {
								schema: {
									$ref: `#/components/schemas/${collectionSchemaResponseRef}`,
								},
							},
						},
					},
					"404": errorResponse(404, "Collection not found"),
				},
			},
			["content:read"],
		),
		patch: withOperation(
			{
				summary: "Update collection schema",
				description:
					"Patches the collection schema. Existing content must still validate against the new schema unless force is true.",
				operationId: "patchCollectionSchema",
				tags: collectionTags,
				security: [{ bearerAuth: [] }],
				parameters: [
					{
						name: "slug",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								$ref: `#/components/schemas/${patchCollectionSchemaInputSchemaRef}`,
							},
						},
					},
				},
				responses: {
					"200": {
						description: "Updated collection",
						content: {
							"application/json": {
								schema: {
									$ref: `#/components/schemas/${collectionWithSchemaSchemaRef}`,
								},
							},
						},
					},
					"404": errorResponse(404, "Collection not found"),
					"409": errorResponse(
						409,
						"Destructive schema changes require force=true",
					),
					"400": errorResponse(400, "Schema must be an object"),
				},
			},
			["schema:admin"],
		),
	},
	"/collections/{slug}": {
		get: withOperation(
			{
				summary: "Get collection",
				description: "Returns a collection including its current schema.",
				operationId: "getCollectionBySlug",
				tags: collectionTags,
				security: [{ bearerAuth: [] }],
				parameters: [
					{
						name: "slug",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
				],
				responses: {
					"200": {
						description: "Collection details",
						content: {
							"application/json": {
								schema: {
									$ref: `#/components/schemas/${collectionWithSchemaSchemaRef}`,
								},
							},
						},
					},
					"404": errorResponse(404, "Collection not found"),
				},
			},
			["content:read"],
		),
		delete: withOperation(
			{
				summary: "Delete collection",
				description:
					"Deletes a collection and all its content. Use force=true if the collection has content.",
				operationId: "deleteCollection",
				tags: collectionTags,
				security: [{ bearerAuth: [] }],
				parameters: [
					{
						name: "slug",
						in: "path",
						required: true,
						schema: { type: "string" },
					},
					{
						name: "force",
						in: "query",
						required: false,
						schema: { type: "boolean" },
					},
				],
				responses: {
					"204": {
						description: "Collection deleted",
					},
					"409": errorResponse(
						409,
						"Collection has content. Use force=true to delete anyway.",
					),
				},
			},
			["schema:admin"],
		),
	},
};
