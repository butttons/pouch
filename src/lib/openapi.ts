import { ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import {
	d1BookmarkHeader,
	d1BookmarkParam,
	errorResponse,
	errorSchema,
	errorSchemaRef,
	withD1Bookmark,
	withErrorResponses,
	withOperation,
} from "@/lib/openapi-helpers";
import { getAllowedOperators } from "@/lib/query-filter";
import { getMediaFields } from "@/lib/schema";

import { auditLogPaths, auditLogSchemas } from "@/routes/audit-log/_openapi";
import {
	collectionPaths,
	collectionSchemas,
} from "@/routes/collection/_openapi";
import {
	mediaObjectSchemaRef,
	mediaPaths,
	mediaSchemas,
} from "@/routes/media/_openapi";
import { oauthClientPaths, oauthClientSchemas } from "@/routes/oauth/_openapi";

import packageJson from "../../package.json";
import type { Deps } from "@/deps";

const baseInfo = {
	title: "pouch",
	version: packageJson.version,
	description:
		"API-first headless CMS backed by Cloudflare D1. All endpoints except /auth/keys require a Bearer token with the appropriate scope. Read-after-write consistency across D1 replicas is supported via the x-d1-bookmark header. Collection schemas are standard JSON Schema with five CMS extensions: x-label (display name), x-widget (authoring hint, e.g. richtext), x-relation (target collection slug), x-index (filterable generated column), and x-media (media reference).",
};

const tags = [
	{ name: "Auth", description: "API key management" },
	{ name: "Collections", description: "Collection and schema management" },
	{ name: "Media", description: "File uploads and media records" },
	{ name: "Audit Log", description: "Audit log entries" },
	{ name: "OAuth", description: "OAuth client registry for the MCP endpoint" },
];

const securitySchemes = {
	bearerAuth: {
		type: "http",
		scheme: "bearer",
		bearerFormat: "JWT",
		description:
			"JWT API key. Create a key via POST /auth/keys using the worker JWT_SECRET, then send it as `Authorization: Bearer <token>`. Tokens carry scopes that determine which endpoints are accessible. See each operation's x-required-scopes extension for the required scope.",
	},
};

const authPaths = {
	"/auth/keys": {
		post: withErrorResponses(
			withD1Bookmark({
				summary: "Create API key",
				description:
					"Creates a new JWT API key. Requires the JWT_SECRET configured on the worker.",
				operationId: "createApiKey",
				tags: ["Auth"],
				requestBody: {
					required: true,
					content: {
						"application/json": {
							schema: {
								type: "object",
								properties: {
									secret: {
										type: "string",
										description:
											"The JWT_SECRET value from the worker environment.",
										example: "a1b2c3d4e5f6...",
									},
									scopes: {
										type: "array",
										items: {
											type: "string",
											enum: ["content:read", "content:write", "schema:admin"],
										},
										description:
											"Scopes for the new key. Defaults to all scopes.",
										example: ["content:read", "content:write"],
									},
									expiresInSeconds: {
										type: "number",
										minimum: 60,
										description:
											"Key lifetime in seconds. Defaults to 180 days.",
										example: 86400,
									},
								},
								required: ["secret"],
								additionalProperties: false,
							},
						},
					},
				},
				responses: {
					"201": {
						description: "Created API key",
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										token: {
											type: "string",
											description:
												"JWT token to use as `Authorization: Bearer <token>`.",
										},
										jti: {
											type: "string",
											description: "Unique key identifier.",
										},
										scopes: {
											type: "array",
											items: { type: "string" },
											description: "Scopes granted to the key.",
										},
										exp: {
											type: "number",
											description: "Unix timestamp when the key expires.",
										},
									},
									required: ["token", "jti", "scopes", "exp"],
									additionalProperties: false,
								},
							},
						},
					},
					"401": errorResponse(401, "Invalid secret"),
				},
			}),
		),
	},
};

const baseSecurity = [{ bearerAuth: [] }];

const contentWrapperSchemaRef = (slug: string) => `__Content_${slug}`;
const contentInputSchemaRef = (slug: string) => `__ContentInput_${slug}`;
const contentBatchInputSchemaRef = (slug: string) =>
	`__ContentBatchInput_${slug}`;
const contentBatchUpdateInputSchemaRef = (slug: string) =>
	`__ContentBatchUpdateInput_${slug}`;
const contentBatchDeleteInputSchemaRef = "ContentBatchDeleteInput";
const resolvedContentSchemaRef = (slug: string) => `__Resolved_${slug}`;
const resolvedContentWrapperSchemaRef = (slug: string) =>
	`__ResolvedContent_${slug}`;

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

const contentBatchDeleteInputSchema = {
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

const buildCollectionContentPaths = (
	slug: string,
	schema: Record<string, unknown>,
) => {
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
				["content:read"],
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
				["content:write"],
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
				["content:write"],
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
				["content:write"],
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
				["content:write"],
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
				["content:write"],
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
				["content:read"],
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
				["content:write"],
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
				["content:write"],
			),
		},
	};
};

/**
 * Builds the full OpenAPI document including dynamic content schemas and paths.
 */
export const assembleOpenAPIDocument = (
	deps: Deps,
	baseUrl?: string,
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
			dynamicSchemas[contentBatchInputSchemaRef(collection.slug)] =
				buildBatchContentInputSchema(collection.slug);

			const resolvedSchema = buildResolvedCollectionSchema(
				collection.slug,
				collection.schema,
			);
			const resolvedWrapper = buildResolvedContentWrapperSchema(
				collection.slug,
				collection.schema,
			);

			if (resolvedSchema) {
				dynamicSchemas[resolvedContentSchemaRef(collection.slug)] =
					resolvedSchema;
			}

			if (resolvedWrapper) {
				dynamicSchemas[resolvedContentWrapperSchemaRef(collection.slug)] =
					resolvedWrapper;
			}

			Object.assign(
				dynamicPaths,
				buildCollectionContentPaths(collection.slug, collection.schema),
			);
		}

		const collectionSlugs = collections.map((c) => c.slug);
		const servers = baseUrl ? [{ url: baseUrl }] : undefined;

		return ok({
			openapi: "3.1.0",
			info: baseInfo,
			tags,
			"x-tagGroups": [
				{
					name: "Management",
					tags: ["Auth", "Collections", "Media", "Audit Log", "OAuth"],
				},
				{ name: "Content", tags: collectionSlugs },
			],
			servers,
			paths: {
				...authPaths,
				...collectionPaths,
				...mediaPaths,
				...auditLogPaths,
				...oauthClientPaths,
				...dynamicPaths,
			},
			components: {
				securitySchemes,
				parameters: {
					d1Bookmark: d1BookmarkParam,
				},
				headers: {
					d1Bookmark: d1BookmarkHeader,
				},
				schemas: {
					[errorSchemaRef]: errorSchema,
					[contentBatchDeleteInputSchemaRef]: contentBatchDeleteInputSchema,
					...collectionSchemas,
					...mediaSchemas,
					...auditLogSchemas,
					...oauthClientSchemas,
					...dynamicSchemas,
				},
			},
		});
	});
