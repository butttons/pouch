import {
	collectionSchema,
	collectionSchemaResponseSchema,
	collectionWithSchemaSchema,
	createCollectionInputSchema,
} from "./_schema";

export const SYSTEM_SCHEMA_PREFIX = "__";

export const collectionSchemaRef = `${SYSTEM_SCHEMA_PREFIX}Collection`;
export const collectionWithSchemaSchemaRef = `${SYSTEM_SCHEMA_PREFIX}CollectionWithSchema`;
export const createCollectionInputSchemaRef = `${SYSTEM_SCHEMA_PREFIX}CreateCollectionInput`;
export const collectionSchemaResponseRef = `${SYSTEM_SCHEMA_PREFIX}CollectionSchema`;

export const collectionOpenAPIComponents = {
	[collectionSchemaRef]: collectionSchema,
	[collectionWithSchemaSchemaRef]: collectionWithSchemaSchema,
	[createCollectionInputSchemaRef]: createCollectionInputSchema,
	[collectionSchemaResponseRef]: collectionSchemaResponseSchema,
};

export const collectionOpenAPIPaths = {
	"/collections": {
		get: {
			summary: "List collections",
			operationId: "listCollections",
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
		post: {
			summary: "Create collection",
			operationId: "createCollection",
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
			},
		},
	},
	"/collections/{slug}/schema": {
		get: {
			summary: "Get collection schema by slug",
			operationId: "getCollectionSchemaBySlug",
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
			},
		},
	},
	"/collections/{slug}": {
		get: {
			summary: "Get collection by slug",
			operationId: "getCollectionBySlug",
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
			},
		},
		delete: {
			summary: "Delete collection",
			operationId: "deleteCollection",
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
			},
		},
	},
};
