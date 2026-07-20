import { StreamableHTTPTransport } from "@hono/mcp";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import type { Hono } from "hono";
import { getContext } from "hono/context-storage";
import { ResultAsync } from "neverthrow";

import { assembleOpenAPIDocument } from "@/lib/openapi";

import { createRouter, type HonoVariables } from "@/utils";

import packageJson from "../../../package.json";

const MAX_TOOL_NAME_LENGTH = 48;
const MAX_RESPONSE_CHARS = 50_000;

const EXCLUDED_PATH_PREFIXES = ["/auth", "/mcp", "/openapi.json"];

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

type OpenApiParameter = {
	name: string;
	in: "path" | "query" | "header";
	required?: boolean;
	schema?: Record<string, unknown>;
};

type OpenApiOperation = {
	operationId?: string;
	summary?: string;
	description?: string;
	tags?: string[];
	parameters?: OpenApiParameter[];
	requestBody?: {
		required?: boolean;
		content?: Record<string, { schema: Record<string, unknown> }>;
	};
};

type OpenApiPathItem = Partial<Record<HttpMethod, OpenApiOperation>>;

type OpenApiDocument = {
	paths?: Record<string, OpenApiPathItem>;
	components?: { schemas?: Record<string, unknown> };
};

type ToolDefinition = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	method: HttpMethod;
	path: string;
};

const isHttpMethod = (value: string): value is HttpMethod =>
	HTTP_METHODS.includes(value as HttpMethod);

const isExcludedPath = (path: string): boolean =>
	EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));

const truncateText = (input: { text: string; maxLength: number }): string => {
	if (input.text.length <= input.maxLength) {
		return input.text;
	}

	return `${input.text.slice(0, input.maxLength)}\n\n[truncated ${input.text.length - input.maxLength} characters]`;
};

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

const buildToolsFromOpenApi = (input: {
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

			tools.push({
				name: buildToolName({ method, path, operation }),
				description: [
					operation.summary,
					operation.description,
					`Method: ${method.toUpperCase()}`,
					`Path: ${path}`,
				]
					.filter(Boolean)
					.join("\n\n"),
				inputSchema: buildToolInputSchema({ operation, schemas }),
				method,
				path,
			});
		}
	}

	return tools;
};

const buildRequest = (input: {
	baseUrl: string;
	path: string;
	method: HttpMethod;
	args: Record<string, unknown>;
}): { url: URL; init: RequestInit } => {
	let requestPath = input.path;
	const query = new URLSearchParams();
	let body: Record<string, unknown> | undefined;

	for (const [key, value] of Object.entries(input.args)) {
		if (value === undefined) {
			continue;
		}

		if (key === "body") {
			body = value as Record<string, unknown>;
			continue;
		}

		const placeholder = `{${key}}`;
		if (requestPath.includes(placeholder)) {
			requestPath = requestPath.replace(
				placeholder,
				encodeURIComponent(String(value)),
			);
		} else {
			query.set(key, String(value));
		}
	}

	const queryString = query.toString();
	const url = new URL(
		`${requestPath}${queryString ? `?${queryString}` : ""}`,
		input.baseUrl,
	);

	const init: RequestInit = {
		method: input.method.toUpperCase(),
		headers: { "content-type": "application/json" },
	};

	if (body !== undefined) {
		init.body = JSON.stringify(body);
	}

	return { url, init };
};

const executeTool = (input: {
	tool: ToolDefinition;
	args: Record<string, unknown>;
	app: Hono<HonoVariables>;
}) => {
	const runTool = async () => {
		const baseUrl = "http://localhost";
		const { url, init } = buildRequest({
			baseUrl,
			path: input.tool.path,
			method: input.tool.method,
			args: input.args,
		});

		const headers = new Headers(init.headers);
		const context = getContext<HonoVariables>();
		// OAuth flow: the provider validated the bearer token and decrypted our
		// props — the pouch JWT minted at consent time lives there, not in the
		// incoming Authorization header (which holds the opaque library token).
		// Header-capable clients fall back to the plain bearer path.
		const props = (
			context.executionCtx as unknown as {
				props?: { accessToken?: string };
			}
		).props;
		const authHeader = props?.accessToken
			? `Bearer ${props.accessToken}`
			: (context.req.header("authorization") ?? context.var.accessToken);
		if (authHeader) {
			headers.set("authorization", authHeader);
		}

		const request = new Request(url, { ...init, headers });
		const response = await input.app.fetch(
			request,
			context.env,
			context.executionCtx,
		);

		const responseText = await response.text();
		const text = truncateText({
			text: responseText,
			maxLength: MAX_RESPONSE_CHARS,
		});

		return {
			isError: !response.ok,
			content: [
				{
					type: "text" as const,
					text: `HTTP ${response.status}\n\n${text}`,
				},
			],
		};
	};

	return ResultAsync.fromPromise(runTool(), (error) =>
		error instanceof Error ? error.message : "Unknown error",
	).match(
		(value) => value,
		(message) => ({
			isError: true,
			content: [{ type: "text" as const, text: `Tool failed: ${message}` }],
		}),
	);
};

/**
 * Fully stateless: every request gets a fresh Server + transport with tools
 * built from a freshly assembled OpenAPI document. No session mode
 * (sessionIdGenerator stays undefined) because session affinity is not
 * guaranteed across Workers isolates — and no shared registration state, so
 * the tool list always reflects the collections that exist right now.
 */
export const createMcpRouter = (app: Hono<HonoVariables>) => {
	const router = createRouter().all("/", async (c) => {
		const accessToken = c.req.query("access_token");
		if (accessToken) {
			c.set("accessToken", `Bearer ${accessToken}`);
		}

		const server = new Server(
			{ name: "pouch", version: packageJson.version },
			{ capabilities: { tools: {} } },
		);

		const result = await assembleOpenAPIDocument(c.var.deps);
		const tools = result.isOk()
			? buildToolsFromOpenApi({ spec: result.value as OpenApiDocument })
			: [];

		server.setRequestHandler(ListToolsRequestSchema, () => ({
			tools: tools.map(({ name, description, inputSchema }) => ({
				name,
				description,
				inputSchema,
			})),
		}));

		server.setRequestHandler(CallToolRequestSchema, async (request) => {
			const tool = tools.find(
				(candidate) => candidate.name === request.params.name,
			);
			if (!tool) {
				throw new McpError(
					ErrorCode.InvalidParams,
					`Tool ${request.params.name} not found`,
				);
			}
			return executeTool({
				tool,
				args: (request.params.arguments ?? {}) as Record<string, unknown>,
				app,
			});
		});

		const transport = new StreamableHTTPTransport();
		await server.connect(transport);
		return transport.handleRequest(c);
	});

	return router;
};
