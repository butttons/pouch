import { errorResponse, withOperation } from "@/lib/openapi-helpers";

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
		id: {
			type: "string",
			pattern: "^med_",
			description: "UUIDv7 media identifier prefixed with `med_`.",
			example: "med_018f1234567890abcdef1234567890ab",
		},
		url: {
			type: "string",
			description: "Public URL to download the file.",
			example: "https://example.com/media/image.png",
		},
		filename: {
			type: "string",
			description: "Original file name.",
			example: "image.png",
		},
		mimeType: {
			type: "string",
			description: "MIME type of the file.",
			example: "image/png",
		},
		sizeBytes: {
			type: "number",
			description: "File size in bytes.",
			example: 12345,
		},
	},
	required: ["id", "url", "filename", "mimeType", "sizeBytes"],
	additionalProperties: false,
};

export const mediaSchemas = {
	[mediaSchemaRef]: mediaResponseSchema,
	[mediaListResponseSchemaRef]: mediaListResponseSchema,
	[mediaObjectSchemaRef]: mediaObjectSchema,
};

const mediaTags = ["Media"];

export const mediaPaths = {
	"/media": {
		get: withOperation(
			{
				summary: "List media",
				description: "Lists uploaded media records.",
				operationId: "list_media",
				tags: mediaTags,
				security: [{ bearerAuth: [] }],
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
			["media:read"],
		),
		post: withOperation(
			{
				summary: "Upload media",
				description: "Uploads a file and creates a media record.",
				operationId: "create_media",
				tags: mediaTags,
				security: [{ bearerAuth: [] }],
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
			["media:write"],
		),
	},
	"/media/{id}": {
		get: withOperation(
			{
				summary: "Get media",
				description: "Returns a media record by ID.",
				operationId: "get_media_by_id",
				tags: mediaTags,
				security: [{ bearerAuth: [] }],
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
					"404": errorResponse(404, "Media not found"),
				},
			},
			["media:read"],
		),
		delete: withOperation(
			{
				summary: "Delete media",
				description: "Deletes a media record and its stored file.",
				operationId: "delete_media",
				tags: mediaTags,
				security: [{ bearerAuth: [] }],
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
					"404": errorResponse(404, "Media not found"),
					"409": errorResponse(
						409,
						"Media is referenced by content and cannot be deleted",
					),
				},
			},
			["media:write"],
		),
	},
	"/media/{id}/file": {
		get: withOperation(
			{
				summary: "Download media file",
				description: "Returns the raw file bytes for a media record.",
				operationId: "get_media_file",
				tags: mediaTags,
				security: [{ bearerAuth: [] }],
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
					"404": errorResponse(404, "Media not found"),
				},
			},
			["media:read"],
		),
	},
};
