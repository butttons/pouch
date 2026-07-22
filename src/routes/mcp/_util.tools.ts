import type {
	HttpMethod,
	OpenApiDocument,
	OpenApiOperation,
	ToolDefinition,
	ToolOutputShape,
} from "./_types";
import { isExcludedPath, isHttpMethod } from "./_types";

const MAX_TOOL_NAME_LENGTH = 48;

const sanitizeToolName = (input: { name: string }): string => {
	const cleaned = input.name.replace(/[^a-zA-Z0-9_-]/g, "_");
	if (cleaned.length <= MAX_TOOL_NAME_LENGTH) {
		return cleaned;
	}

	const hash = Array.from(cleaned)
		.slice(0, -16)
		.reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0)
		.toString(16)
		.slice(0, 12);

	return `${cleaned.slice(0, MAX_TOOL_NAME_LENGTH - hash.length - 1)}_${hash}`;
};

const buildToolName = (input: {
	method: HttpMethod;
	path: string;
	operation: OpenApiOperation;
}): string => {
	if (input.operation.operationId) {
		return sanitizeToolName({ name: input.operation.operationId });
	}

	const methodPart = input.method.toLowerCase();
	const pathPart = input.path
		.replace(/[{}]/g, "")
		.replace(/[^a-zA-Z0-9]/g, "_");
	return sanitizeToolName({ name: `${methodPart}_${pathPart}` });
};

const CONTENT_PATH_PATTERN = /^\/collections\/([^/]+)\/content(?=\/|:|$)/;

const buildToolTitle = (input: {
	method: HttpMethod;
	path: string;
	operation: OpenApiOperation;
}): string | undefined => {
	const baseTitle = input.operation.summary ?? input.operation.operationId;
	if (!baseTitle) return undefined;

	const match = CONTENT_PATH_PATTERN.exec(input.path);
	if (match) {
		return `${baseTitle} '${match[1]}'`;
	}

	return baseTitle;
};

const buildToolAnnotations = (input: {
	method: HttpMethod;
	title?: string;
}): Record<string, unknown> => {
	const isReadOnly = input.method === "get";
	const isIdempotent =
		isReadOnly || input.method === "put" || input.method === "delete";

	return {
		...(input.title ? { title: input.title } : {}),
		readOnlyHint: isReadOnly,
		destructiveHint: !isReadOnly && input.method !== "post",
		idempotentHint: isIdempotent,
		openWorldHint: false,
	};
};

const COMPONENTS_SCHEMAS_PREFIX = "#/components/schemas/";

/**
 * Deep-resolves local `#/components/schemas/*` refs so tool input schemas are
 * fully self-contained — MCP clients see the actual structure (properties,
 * required fields, enums) instead of an unresolvable pointer. Cycles and
 * unknown refs degrade to a generic object rather than failing the document.
 */
const resolveSchemaRefs = (input: {
	schema: unknown;
	schemas: Record<string, unknown>;
	seen?: Set<string>;
}): unknown => {
	const seen = input.seen ?? new Set<string>();

	if (Array.isArray(input.schema)) {
		return input.schema.map((item) =>
			resolveSchemaRefs({ schema: item, schemas: input.schemas, seen }),
		);
	}

	if (!input.schema || typeof input.schema !== "object") {
		return input.schema;
	}

	const record = input.schema as Record<string, unknown>;
	const ref = record.$ref;
	if (typeof ref === "string" && ref.startsWith(COMPONENTS_SCHEMAS_PREFIX)) {
		const refName = ref.slice(COMPONENTS_SCHEMAS_PREFIX.length);
		const target = input.schemas[refName];
		if (!target || seen.has(refName)) {
			return { type: "object" };
		}
		return resolveSchemaRefs({
			schema: target,
			schemas: input.schemas,
			seen: new Set(seen).add(refName),
		});
	}

	return Object.fromEntries(
		Object.entries(record).map(([key, value]) => [
			key,
			resolveSchemaRefs({ schema: value, schemas: input.schemas, seen }),
		]),
	);
};

const buildToolInputSchema = (input: {
	operation: OpenApiOperation;
	schemas: Record<string, unknown>;
}): Record<string, unknown> => {
	const properties: Record<string, unknown> = {};
	const required: string[] = [];

	for (const parameter of input.operation.parameters ?? []) {
		// $ref-only parameters (e.g. the shared d1Bookmark header) carry no
		// inline schema and are not resolvable here — skip them.
		if (!parameter.schema) continue;
		properties[parameter.name] = resolveSchemaRefs({
			schema: parameter.schema,
			schemas: input.schemas,
		});
		if (parameter.required === true) {
			required.push(parameter.name);
		}
	}

	const bodySchema =
		input.operation.requestBody?.content?.["application/json"]?.schema;
	if (bodySchema) {
		properties.body = resolveSchemaRefs({
			schema: bodySchema,
			schemas: input.schemas,
		});
		if (input.operation.requestBody?.required) {
			required.push("body");
		}
	}

	return {
		type: "object",
		properties,
		...(required.length > 0 ? { required } : {}),
	};
};

const SUCCESS_STATUS_PATTERN = /^2\d\d$/;

/**
 * Derives the MCP outputSchema from the operation's first 2xx response.
 * MCP requires a top-level object schema, so array/scalar bodies are wrapped
 * under a `data` key and executeTool mirrors that wrapping in
 * structuredContent. 204-style responses (no content) map to an empty object;
 * non-JSON success bodies (file downloads) declare no schema at all.
 */
const buildToolOutputShape = (input: {
	operation: OpenApiOperation;
	schemas: Record<string, unknown>;
}): ToolOutputShape | undefined => {
	const responses = input.operation.responses ?? {};
	const successStatus = Object.keys(responses)
		.filter((status) => SUCCESS_STATUS_PATTERN.test(status))
		.sort()[0];

	if (!successStatus) {
		return undefined;
	}

	const content = responses[successStatus]?.content;
	if (!content) {
		return {
			outputSchema: {
				type: "object",
				properties: {},
				additionalProperties: false,
			},
		};
	}

	const bodySchema = content["application/json"]?.schema;
	if (!bodySchema) {
		return undefined;
	}

	const resolved = resolveSchemaRefs({
		schema: bodySchema,
		schemas: input.schemas,
	}) as Record<string, unknown>;

	if (resolved.type !== "object" && !resolved.properties) {
		return {
			outputSchema: {
				type: "object",
				properties: { data: resolved },
				required: ["data"],
				additionalProperties: false,
			},
			wrapKey: "data",
		};
	}

	return { outputSchema: { type: "object", ...resolved } };
};

export const buildToolsFromOpenApi = (input: {
	spec: OpenApiDocument;
}): ToolDefinition[] => {
	const schemas = input.spec.components?.schemas ?? {};
	const tools: ToolDefinition[] = [];

	for (const [path, pathItem] of Object.entries(input.spec.paths ?? {})) {
		if (!pathItem || isExcludedPath(path)) {
			continue;
		}

		for (const [method, operation] of Object.entries(pathItem)) {
			if (!isHttpMethod(method) || !operation) {
				continue;
			}

			const outputShape = buildToolOutputShape({ operation, schemas });
			const title = buildToolTitle({ method, path, operation });
			const annotations = buildToolAnnotations({ method, title });

			tools.push({
				name: buildToolName({ method, path, operation }),
				title,
				description: [
					operation.summary,
					operation.description,
					`Method: ${method.toUpperCase()}`,
					`Path: ${path}`,
				]
					.filter(Boolean)
					.join("\n\n"),
				inputSchema: buildToolInputSchema({ operation, schemas }),
				outputSchema: outputShape?.outputSchema,
				outputWrapKey: outputShape?.wrapKey,
				annotations,
				method,
				path,
			});
		}
	}

	return tools;
};
