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

const buildCollectionContentPaths = (slug: string) => ({
	[`/collections/${slug}/content`]: {
		get: {
			summary: `List ${slug} content`,
			operationId: `list${slug}Content`,
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
					description: `List of ${slug} content`,
					content: {
						"application/json": {
							schema: {
								type: "array",
								items: {
									$ref: `#/components/schemas/${slug}`,
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
							$ref: `#/components/schemas/${slug}`,
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
								$ref: `#/components/schemas/${slug}`,
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
					name: "slug",
					in: "path",
					required: true,
					schema: { type: "string" },
				},
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
								$ref: `#/components/schemas/${slug}`,
							},
						},
					},
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
