import {
	mediaIdParamSchema,
	mediaListResponseSchema,
	mediaQuerySchema,
	mediaResponseSchema,
} from "./_schema";

export const SYSTEM_SCHEMA_PREFIX = "__";

export const mediaSchemaRef = `${SYSTEM_SCHEMA_PREFIX}Media`;
export const mediaListResponseSchemaRef = `${SYSTEM_SCHEMA_PREFIX}MediaListResponse`;
export const mediaObjectSchemaRef = `${SYSTEM_SCHEMA_PREFIX}MediaObject`;

export const mediaObjectSchema = {
	type: "object",
	properties: {
		id: { type: "string", pattern: "^med_" },
		url: { type: "string" },
		filename: { type: "string" },
		mimeType: { type: "string" },
		sizeBytes: { type: "number" },
	},
	required: ["id", "url", "filename", "mimeType", "sizeBytes"],
	additionalProperties: false,
};

export const mediaOpenAPIComponents = {
	[mediaSchemaRef]: mediaResponseSchema,
	[mediaListResponseSchemaRef]: mediaListResponseSchema,
	[mediaObjectSchemaRef]: mediaObjectSchema,
};

export const mediaOpenAPIPaths = {
	"/media": {
		get: {
			summary: "List media",
			operationId: "listMedia",
			parameters: [
				{
					name: "limit",
					in: "query",
					required: false,
					schema: {
						type: "integer",
						minimum: 1,
						maximum: 500,
						default: 50,
						description: "Maximum number of items to return.",
					},
				},
				{
					name: "cursor",
					in: "query",
					required: false,
					schema: {
						type: "string",
						pattern: "^med_",
						description: "ID of the last item from the previous page.",
					},
				},
			],
			responses: {
				"200": {
					description: "List of media",
					content: {
						"application/json": {
							schema: {
								$ref: `#/components/schemas/${mediaListResponseSchemaRef}`,
							},
						},
					},
				},
			},
		},
		post: {
			summary: "Upload media",
			operationId: "createMedia",
			requestBody: {
				required: true,
				content: {
					"multipart/form-data": {
						schema: {
							type: "object",
							properties: {
								file: {
									type: "string",
									format: "binary",
									description: "File to upload",
								},
							},
							required: ["file"],
						},
					},
				},
			},
			responses: {
				"201": {
					description: "Created media",
					content: {
						"application/json": {
							schema: {
								$ref: `#/components/schemas/${mediaSchemaRef}`,
							},
						},
					},
				},
			},
		},
	},
	"/media/{id}": {
		get: {
			summary: "Get media by ID",
			operationId: "getMediaById",
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
					description: "Media details",
					content: {
						"application/json": {
							schema: {
								$ref: `#/components/schemas/${mediaSchemaRef}`,
							},
						},
					},
				},
			},
		},
		delete: {
			summary: "Delete media",
			operationId: "deleteMedia",
			parameters: [
				{
					name: "id",
					in: "path",
					required: true,
					schema: { type: "string" },
				},
			],
			responses: {
				"204": {
					description: "Media deleted",
				},
			},
		},
	},
	"/media/{id}/file": {
		get: {
			summary: "Get media file content",
			operationId: "getMediaFile",
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
					description: "Media file content",
					content: {
						"application/octet-stream": {
							schema: {
								type: "string",
								format: "binary",
							},
						},
					},
				},
			},
		},
	},
};
