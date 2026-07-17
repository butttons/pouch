import {
	collectionSchema,
	createCollectionInputSchema,
} from "./_schema";

export const SYSTEM_SCHEMA_PREFIX = "__";

export const collectionSchemaRef = `${SYSTEM_SCHEMA_PREFIX}Collection`;
export const createCollectionInputSchemaRef = `${SYSTEM_SCHEMA_PREFIX}CreateCollectionInput`;

export const collectionOpenAPIComponents = {
	[collectionSchemaRef]: collectionSchema,
	[createCollectionInputSchemaRef]: createCollectionInputSchema,
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
	"/collections/{id}": {
		get: {
			summary: "Get collection by ID",
			operationId: "getCollectionById",
			parameters: [
				{
					name: "id",
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
								$ref: `#/components/schemas/${collectionSchemaRef}`,
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
					name: "id",
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
