import { ok, ResultAsync, safeTry } from "neverthrow";

import type { Deps } from "@/deps";
import type { DataLayerError } from "@/lib/data";
import {
	collectionOpenAPIComponents,
	collectionOpenAPIPaths,
} from "@/routes/collection/_openapi";

const baseInfo = {
	title: "feedr",
	version: "0.0.1",
};

const contentWrapperSchemaRef = (slug: string) => `__Content_${slug}`;
const contentInputSchemaRef = (slug: string) => `__ContentInput_${slug}`;

const buildContentWrapperSchema = (slug: string) => ({
	type: "object",
	properties: {
		id: { type: "string" },
		collectionId: { type: "string" },
		data: { $ref: `#/components/schemas/${slug}` },
		status: {
			type: "string",
			enum: ["draft", "published", "archived"],
		},
		schemaVersionId: { type: "string" },
		createdAt: { type: "number" },
		updatedAt: { type: "number" },
	},
	required: [
		"id",
		"collectionId",
		"data",
		"status",
		"schemaVersionId",
		"createdAt",
		"updatedAt",
	],
	additionalProperties: false,
});

const buildContentInputSchema = (slug: string) => ({
	type: "object",
	properties: {
		data: { $ref: `#/components/schemas/${slug}` },
		status: {
			type: "string",
			enum: ["draft", "published", "archived"],
		},
	},
	required: ["data"],
	additionalProperties: false,
});

const buildCollectionContentPaths = (slug: string) => ({
	[`/collections/${slug}/content`]: {
		get: {
			summary: `List ${slug} content`,
			operationId: `list${slug}Content`,
			responses: {
				"200": {
					description: `List of ${slug} content`,
					content: {
						"application/json": {
							schema: {
								type: "array",
								items: {
									$ref: `#/components/schemas/${contentWrapperSchemaRef(slug)}`,
								},
							},
						},
					},
				},
			},
		},
		post: {
			summary: `Create ${slug} content`,
			operationId: `create${slug}Content`,
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							$ref: `#/components/schemas/${contentInputSchemaRef(slug)}`,
						},
					},
				},
			},
			responses: {
				"201": {
					description: `Created ${slug} content`,
					content: {
						"application/json": {
							schema: {
								$ref: `#/components/schemas/${contentWrapperSchemaRef(slug)}`,
							},
						},
					},
				},
			},
		},
	},
	[`/collections/${slug}/content:validate`]: {
		post: {
			summary: `Validate ${slug} content`,
			operationId: `validate${slug}Content`,
			requestBody: {
				required: true,
				content: {
					"application/json": {
						schema: {
							$ref: `#/components/schemas/${contentInputSchemaRef(slug)}`,
						},
					},
				},
			},
			responses: {
				"200": {
					description: `Validation result`,
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									valid: { type: "boolean" },
								},
								required: ["valid"],
								additionalProperties: false,
							},
						},
					},
				},
			},
		},
	},
	[`/collections/${slug}/content/{id}`]: {
		get: {
			summary: `Get ${slug} content by ID`,
			operationId: `get${slug}ContentById`,
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
					description: `${slug} content details`,
					content: {
						"application/json": {
							schema: {
								$ref: `#/components/schemas/${contentWrapperSchemaRef(slug)}`,
							},
						},
					},
				},
			},
		},
		patch: {
			summary: `Update ${slug} content`,
			operationId: `update${slug}Content`,
			parameters: [
				{
					name: "id",
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
							$ref: `#/components/schemas/${contentInputSchemaRef(slug)}`,
						},
					},
				},
			},
			responses: {
				"200": {
					description: `Updated ${slug} content`,
					content: {
						"application/json": {
							schema: {
								$ref: `#/components/schemas/${contentWrapperSchemaRef(slug)}`,
							},
						},
					},
				},
			},
		},
		delete: {
			summary: `Delete ${slug} content`,
			operationId: `delete${slug}Content`,
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
					description: `${slug} content deleted`,
				},
			},
		},
	},
});

export const assembleOpenAPIDocument = (
	deps: Deps,
): ResultAsync<Record<string, unknown>, DataLayerError> =>
	safeTry(async function* () {
		const collections = yield* deps.DL.collection.listCollectionsWithSchema();

		const dynamicSchemas: Record<string, unknown> = {};
		const dynamicPaths: Record<string, unknown> = {};

		for (const collection of collections) {
			dynamicSchemas[collection.slug] = collection.schema;
			dynamicSchemas[contentWrapperSchemaRef(collection.slug)] =
				buildContentWrapperSchema(collection.slug);
			dynamicSchemas[contentInputSchemaRef(collection.slug)] =
				buildContentInputSchema(collection.slug);

			Object.assign(
				dynamicPaths,
				buildCollectionContentPaths(collection.slug),
			);
		}

		return ok({
			openapi: "3.1.0",
			info: baseInfo,
			paths: {
				...collectionOpenAPIPaths,
				...dynamicPaths,
			},
			components: {
				schemas: {
					...collectionOpenAPIComponents,
					...dynamicSchemas,
				},
			},
		});
	});
