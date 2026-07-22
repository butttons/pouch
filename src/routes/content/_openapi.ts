import { errorResponse, withOperation } from "@/lib/openapi/helpers";
import { getAllowedOperators } from "@/lib/query-filter";
import { getMediaFields } from "@/lib/schema";

import { mediaObjectSchemaRef } from "@/routes/media/_openapi";

const baseSecurity = [{ bearerAuth: [] }];

const contentWrapperSchemaRef = (slug: string) => `__Content_${slug}`;
const contentInputSchemaRef = (slug: string) => `__ContentInput_${slug}`;
const contentBatchInputSchemaRef = (slug: string) =>
	`__ContentBatchInput_${slug}`;
const contentBatchUpdateInputSchemaRef = (slug: string) =>
	`__ContentBatchUpdateInput_${slug}`;
const resolvedContentSchemaRef = (slug: string) => `__Resolved_${slug}`;
const resolvedContentWrapperSchemaRef = (slug: string) =>
	`__ResolvedContent_${slug}`;

export const contentBatchDeleteInputSchemaRef = "ContentBatchDeleteInput";

type JsonSchemaProperty = {
	type?: string | string[];
	format?: string;
	enum?: unknown[];
	"x-relation"?: string;
	"x-media"?: boolean;
};

const buildParameterSchema = (
	property: JsonSchemaProperty,
): Record<string, unknown> => {
	const schema: Record<string, unknown> = {};

	if (property.enum) {
		schema.enum = property.enum;
	}

	if (property.type === "integer") {
		schema.type = "integer";
		return schema;
	}

	if (property.type === "number") {
		schema.type = "number";
		return schema;
	}

	if (property.type === "boolean") {
		schema.type = "boolean";
		return schema;
	}

	schema.type = "string";

	if (property.format) {
		schema.format = property.format;
	}

	return schema;
};

const getRelationFields = (
	schema: Record<string, unknown>,
): Array<{ field: string; targetSlug: string; isMany: boolean }> => {
	const fields: Array<{ field: string; targetSlug: string; isMany: boolean }> =
		[];

	if (!schema.properties || typeof schema.properties !== "object") {
		return fields;
	}

	const properties = schema.properties as Record<string, JsonSchemaProperty>;

	for (const [field, property] of Object.entries(properties)) {
		const targetSlug = property["x-relation"];
		if (typeof targetSlug !== "string" || targetSlug.length === 0) {
			continue;
		}

		fields.push({
			field,
			targetSlug,
			isMany: property.type === "array",
		});
	}

	return fields;
};

const buildContentQueryParameters = (
	schema: Record<string, unknown>,
): Array<Record<string, unknown>> => {
	const parameters: Array<Record<string, unknown>> = [
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
				pattern: "^con_",
				description: "ID of the last item from the previous page.",
			},
		},
	];

	if (!schema.properties || typeof schema.properties !== "object") {
		return parameters;
	}

	const properties = schema.properties as Record<string, JsonSchemaProperty>;

	for (const [field, property] of Object.entries(properties)) {
		const operators = getAllowedOperators(property);

		for (const op of operators) {
			const name = op === "eq" ? field : `${field}[${op}]`;
			parameters.push({
				name,
				in: "query",
				required: false,
				schema: buildParameterSchema(property),
			});
		}
	}

	const relationFields = getRelationFields(schema);
	const mediaFields = getMediaFields({ schema });
	const resolvableFields = [...relationFields, ...mediaFields];

	if (resolvableFields.length > 0) {
		parameters.push({
			name: "resolve",
			in: "query",
			required: false,
			schema: {
				type: "string",
				example: resolvableFields.map((field) => field.field).join(","),
				description:
					"Comma-separated relation or media fields to resolve. Related IDs are replaced with the full content wrapper; media objects are replaced with the full media record.",
			},
		});
	}

	return parameters;
};

const buildContentWrapperSchema = (slug: string) => ({
	type: "object",
	properties: {
		id: {
			type: "string",
			description: "UUIDv7 content identifier prefixed with `con_`.",
			example: "con_018f1234567890abcdef1234567890ab",
		},
		collectionId: {
			type: "string",
			description: "UUIDv7 collection identifier prefixed with `col_`.",
			example: "col_018f1234567890abcdef1234567890ab",
		},
		data: { $ref: `#/components/schemas/${slug}` },
		status: {
			type: "string",
			enum: ["draft", "published", "archived"],
			description:
				"Lifecycle state of the content. Use `published` for live content.",
			example: "published",
		},
		schemaVersionId: {
			type: "string",
			description: "UUIDv7 schema version identifier prefixed with `sch_`.",
			example: "sch_018f1234567890abcdef1234567890ab",
		},
		createdAt: {
			type: "number",
			description: "Unix timestamp in milliseconds when the item was created.",
			example: 1704067200000,
		},
		updatedAt: {
			type: "number",
			description:
				"Unix timestamp in milliseconds when the item was last updated.",
			example: 1704067200000,
		},
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

const buildResolvedCollectionSchema = (
	slug: string,
	schema: Record<string, unknown>,
): Record<string, unknown> | null => {
	if (!schema.properties || typeof schema.properties !== "object") {
		return null;
	}

	const properties = schema.properties as Record<string, JsonSchemaProperty>;
	const resolvedProperties: Record<string, unknown> = {};
	let hasResolvables = false;
	const mediaRef = `#/components/schemas/${mediaObjectSchemaRef}`;

	for (const [field, property] of Object.entries(properties)) {
		const targetSlug = property["x-relation"];
		const isMedia = property["x-media"] === true;

		if (typeof targetSlug === "string" && targetSlug.length > 0) {
			hasResolvables = true;
			const targetRef = `#/components/schemas/${contentWrapperSchemaRef(targetSlug)}`;

			if (property.type === "array") {
				resolvedProperties[field] = {
					type: "array",
					items: { $ref: targetRef },
				};
			} else {
				resolvedProperties[field] = { $ref: targetRef };
			}
			continue;
		}

		if (isMedia) {
			hasResolvables = true;

			if (property.type === "array") {
				resolvedProperties[field] = {
					type: "array",
					items: { $ref: mediaRef },
				};
			} else {
				resolvedProperties[field] = { $ref: mediaRef };
			}
			continue;
		}

		resolvedProperties[field] = property;
	}

	if (!hasResolvables) {
		return null;
	}

	return {
		type: "object",
		properties: resolvedProperties,
		required: Array.isArray(schema.required) ? schema.required : [],
		additionalProperties: false,
	};
};

const buildResolvedContentWrapperSchema = (
	slug: string,
	schema: Record<string, unknown>,
): Record<string, unknown> | null => {
	const resolvedDataSchema = buildResolvedCollectionSchema(slug, schema);
	if (!resolvedDataSchema) {
		return null;
	}

	return {
		type: "object",
		properties: {
			id: { type: "string" },
			collectionId: { type: "string" },
			data: { $ref: `#/components/schemas/${resolvedContentSchemaRef(slug)}` },
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
	};
};

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

const buildBatchContentInputSchema = (slug: string) => ({
	type: "object",
	properties: {
		items: {
			type: "array",
			items: { $ref: `#/components/schemas/${contentInputSchemaRef(slug)}` },
			minItems: 1,
		},
	},
	required: ["items"],
	additionalProperties: false,
});

const buildBatchUpdateContentInputSchema = (slug: string) => ({
	type: "object",
	properties: {
		items: {
			type: "array",
			items: {
				type: "object",
				properties: {
					id: { type: "string", pattern: "^con_" },
					data: { $ref: `#/components/schemas/${slug}` },
					status: {
						type: "string",
						enum: ["draft", "published", "archived"],
					},
				},
				required: ["id"],
				additionalProperties: false,
			},
			minItems: 1,
		},
	},
	required: ["items"],
	additionalProperties: false,
});

export const contentBatchDeleteInputSchema = {
	type: "object",
	properties: {
		ids: {
			type: "array",
			items: { type: "string", pattern: "^con_" },
			minItems: 1,
		},
	},
	required: ["ids"],
	additionalProperties: false,
};

const buildContentItemSchema = (
	slug: string,
	schema: Record<string, unknown>,
): Record<string, unknown> => {
	const resolvedWrapper = buildResolvedContentWrapperSchema(slug, schema);
	if (!resolvedWrapper) {
		return { $ref: `#/components/schemas/${contentWrapperSchemaRef(slug)}` };
	}

	return {
		oneOf: [
			{ $ref: `#/components/schemas/${contentWrapperSchemaRef(slug)}` },
			{ $ref: `#/components/schemas/${resolvedContentWrapperSchemaRef(slug)}` },
		],
	};
};

/**
 * Builds every dynamic component schema a collection contributes to the
 * OpenAPI document: the raw data schema (keyed by slug), the content wrapper
 * and input schemas, and — when the collection has relation or media fields —
 * the resolved variants.
 */
export const buildContentSchemas = (input: {
	slug: string;
	schema: Record<string, unknown>;
}): Record<string, unknown> => {
	const schemas: Record<string, unknown> = {
		[input.slug]: input.schema,
		[contentWrapperSchemaRef(input.slug)]: buildContentWrapperSchema(
			input.slug,
		),
		[contentInputSchemaRef(input.slug)]: buildContentInputSchema(input.slug),
		[contentBatchInputSchemaRef(input.slug)]: buildBatchContentInputSchema(
			input.slug,
		),
		[contentBatchUpdateInputSchemaRef(input.slug)]:
			buildBatchUpdateContentInputSchema(input.slug),
	};

	const resolvedSchema = buildResolvedCollectionSchema(
		input.slug,
		input.schema,
	);
	const resolvedWrapper = buildResolvedContentWrapperSchema(
		input.slug,
		input.schema,
	);

	if (resolvedSchema) {
		schemas[resolvedContentSchemaRef(input.slug)] = resolvedSchema;
	}

	if (resolvedWrapper) {
		schemas[resolvedContentWrapperSchemaRef(input.slug)] = resolvedWrapper;
	}

	return schemas;
};

/**
 * Builds the OpenAPI paths for a collection's content endpoints.
 */
export const buildContentPaths = (input: {
	slug: string;
	schema: Record<string, unknown>;
}): Record<string, unknown> => {
	const { slug, schema } = input;
	const collectionTag = slug;

	return {
		[`/collections/${slug}/content`]: {
			get: withOperation(
				{
					summary: "List",
					description: `Lists content in the ${slug} collection with optional filtering and relation/media resolution.`,
					operationId: `list_${slug}_content`,
					tags: [collectionTag],
					security: baseSecurity,
					parameters: buildContentQueryParameters(schema),
					responses: {
						"200": {
							description: `List of ${slug} content`,
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											data: {
												type: "array",
												items: buildContentItemSchema(slug, schema),
											},
											nextCursor: {
												type: ["string", "null"],
												description:
													"ID cursor for the next page, or null if there are no more items.",
											},
										},
										required: ["data", "nextCursor"],
										additionalProperties: false,
									},
								},
							},
						},
					},
				},
				["collection:read", "content:read"],
			),
			post: withOperation(
				{
					summary: "Create",
					description: `Creates a new content item in the ${slug} collection.`,
					operationId: `create_${slug}_content`,
					tags: [collectionTag],
					security: baseSecurity,
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
						"409": errorResponse(
							409,
							"Collection has no current schema version",
						),
					},
				},
				["collection:read", "content:write"],
			),
		},
		[`/collections/${slug}/content/batch`]: {
			post: withOperation(
				{
					summary: "Create batch",
					description: `Creates multiple content items in the ${slug} collection in a single request.`,
					operationId: `create_${slug}_content_batch`,
					tags: [collectionTag],
					security: baseSecurity,
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									$ref: `#/components/schemas/${contentBatchInputSchemaRef(slug)}`,
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
										type: "object",
										properties: {
											data: {
												type: "array",
												items: {
													$ref: `#/components/schemas/${contentWrapperSchemaRef(slug)}`,
												},
											},
										},
										required: ["data"],
										additionalProperties: false,
									},
								},
							},
						},
						"409": errorResponse(
							409,
							"Collection has no current schema version",
						),
					},
				},
				["collection:read", "content:write"],
			),
			patch: withOperation(
				{
					summary: "Update batch",
					description: `Updates multiple content items in the ${slug} collection in a single request.`,
					operationId: `update_${slug}_content_batch`,
					tags: [collectionTag],
					security: baseSecurity,
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									$ref: `#/components/schemas/${contentBatchUpdateInputSchemaRef(slug)}`,
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
										type: "object",
										properties: {
											data: {
												type: "array",
												items: {
													$ref: `#/components/schemas/${contentWrapperSchemaRef(slug)}`,
												},
											},
										},
										required: ["data"],
										additionalProperties: false,
									},
								},
							},
						},
						"404": errorResponse(404, "Content not found"),
						"409": errorResponse(409),
					},
				},
				["collection:read", "content:write"],
			),
			delete: withOperation(
				{
					summary: "Delete batch",
					description: `Deletes multiple content items in the ${slug} collection in a single request.`,
					operationId: `delete_${slug}_content_batch`,
					tags: [collectionTag],
					security: baseSecurity,
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									$ref: `#/components/schemas/${contentBatchDeleteInputSchemaRef}`,
								},
							},
						},
					},
					responses: {
						"204": {
							description: `${slug} content deleted`,
						},
						"404": errorResponse(404, "Content not found"),
					},
				},
				["collection:read", "content:write"],
			),
		},
		[`/collections/${slug}/content:validate`]: {
			post: withOperation(
				{
					summary: "Validate",
					description: `Validates content data against the ${slug} schema without creating it.`,
					operationId: `validate_${slug}_content`,
					tags: [collectionTag],
					security: baseSecurity,
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
						"400": errorResponse(400, "Content validation failed"),
					},
				},
				["collection:read", "content:write"],
			),
		},
		[`/collections/${slug}/content/{id}`]: {
			get: withOperation(
				{
					summary: "Get by ID",
					description: `Returns a single ${slug} content item.`,
					operationId: `get_${slug}_content_by_id`,
					tags: [collectionTag],
					security: baseSecurity,
					parameters: [
						{
							name: "id",
							in: "path",
							required: true,
							schema: { type: "string" },
						},
						...buildContentQueryParameters(schema).filter(
							(param) => param.name === "resolve",
						),
					],
					responses: {
						"200": {
							description: `${slug} content details`,
							content: {
								"application/json": {
									schema: buildContentItemSchema(slug, schema),
								},
							},
						},
						"404": errorResponse(404, "Content not found"),
					},
				},
				["collection:read", "content:read"],
			),
			patch: withOperation(
				{
					summary: "Update",
					description: `Updates a ${slug} content item.`,
					operationId: `update_${slug}_content`,
					tags: [collectionTag],
					security: baseSecurity,
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
						"404": errorResponse(404, "Content not found"),
						"409": errorResponse(409),
					},
				},
				["collection:read", "content:write"],
			),
			delete: withOperation(
				{
					summary: "Delete",
					description: `Deletes a ${slug} content item.`,
					operationId: `delete_${slug}_content`,
					tags: [collectionTag],
					security: baseSecurity,
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
						"404": errorResponse(404, "Content not found"),
					},
				},
				["collection:read", "content:write"],
			),
		},
	};
};
