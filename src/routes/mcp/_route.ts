import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Hono } from "hono";
import { getContext } from "hono/context-storage";
import { z } from "zod";

import { assembleOpenAPIDocument } from "@/lib/openapi";

import { createRouter, type HonoVariables } from "@/utils";

import packageJson from "../../../package.json";
import type { Deps } from "@/deps";

const MAX_TOOL_NAME_LENGTH = 48;
const MAX_RESPONSE_CHARS = 50_000;

const EXCLUDED_PATH_PREFIXES = ["/auth", "/mcp", "/openapi.json"];

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

type OpenApiParameter = {
	name: string;
	in: "path" | "query" | "header";
	required?: boolean;
	schema: Record<string, unknown>;
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
};

const isHttpMethod = (value: string): value is HttpMethod =>
	HTTP_METHODS.includes(value as HttpMethod);

const isExcludedPath = (path: string): boolean =>
	EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));

const truncateText = (text: string, maxLength: number): string => {
	if (text.length <= maxLength) {
		return text;
	}

	return `${text.slice(0, maxLength)}\n\n[truncated ${text.length - maxLength} characters]`;
};

const sanitizeToolName = (name: string): string => {
	const cleaned = name.replace(/[^a-zA-Z0-9_-]/g, "_");
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

const buildToolName = (
	method: HttpMethod,
	path: string,
	operation: OpenApiOperation,
): string => {
	if (operation.operationId) {
		return sanitizeToolName(operation.operationId);
	}

	const methodPart = method.toLowerCase();
	const pathPart = path.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]/g, "_");
	return sanitizeToolName(`${methodPart}_${pathPart}`);
};

const jsonSchemaToZod = (
	schema: Record<string, unknown>,
	isRequired: boolean,
): z.ZodTypeAny => {
	let field: z.ZodTypeAny;

	if (Array.isArray(schema.enum) && schema.enum.length > 0) {
		const values = schema.enum as Array<string | number | boolean>;
		const allStrings = values.every((value) => typeof value === "string");
		if (allStrings) {
			field = z.enum(values as unknown as [string, ...string[]]);
		} else {
			const literals = values.map((value) =>
				z.literal(value as string | number | boolean),
			) as z.ZodTypeAny[];
			field = z.union(
				literals as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
			);
		}
	} else if (schema.type === "integer") {
		field = z.number().int();
	} else if (schema.type === "number") {
		field = z.number();
	} else if (schema.type === "boolean") {
		field = z.boolean();
	} else {
		field = z.string();
	}

	if (!isRequired) {
		field = field.optional();
	}

	return field;
};

const buildInputSchema = (
	operation: OpenApiOperation,
): Record<string, z.ZodTypeAny> => {
	const shape: Record<string, z.ZodTypeAny> = {};

	for (const parameter of operation.parameters ?? []) {
		// $ref parameters (e.g. the shared d1Bookmark header) have no inline
		// schema and are not resolvable here — skip them.
		if (!parameter.schema) continue;
		const isRequired = parameter.required === true;
		shape[parameter.name] = jsonSchemaToZod(parameter.schema, isRequired);
	}

	const jsonBody = operation.requestBody?.content?.["application/json"];
	if (jsonBody) {
		shape.body = z
			.record(z.string(), z.unknown())
			.describe(`Request body schema: ${JSON.stringify(jsonBody.schema)}`);
	}

	return shape;
};

const buildRequest = (
	baseUrl: string,
	path: string,
	method: HttpMethod,
	args: Record<string, unknown>,
): { url: URL; init: RequestInit } => {
	let requestPath = path;
	const query = new URLSearchParams();
	let body: Record<string, unknown> | undefined;

	for (const [key, value] of Object.entries(args)) {
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
		baseUrl,
	);

	const init: RequestInit = {
		method: method.toUpperCase(),
		headers: { "content-type": "application/json" },
	};

	if (body !== undefined) {
		init.body = JSON.stringify(body);
	}

	return { url, init };
};

export const createMcpRouter = (app: Hono<HonoVariables>) => {
	const mcpServer = new McpServer({
		name: "pouch",
		version: packageJson.version,
	});

	const transport = new StreamableHTTPTransport();
	let hasRegisteredTools = false;

	const registerToolsFromOpenApi = async (deps: Deps) => {
		if (hasRegisteredTools) {
			return;
		}

		const result = await assembleOpenAPIDocument(deps);
		const spec = result.isOk() ? result.value : null;

		if (!spec || typeof spec !== "object") {
			return;
		}

		const openApiSpec = spec as OpenApiDocument;

		for (const [path, pathItem] of Object.entries(openApiSpec.paths ?? {})) {
			if (!pathItem || isExcludedPath(path)) {
				continue;
			}

			for (const [method, operation] of Object.entries(pathItem)) {
				if (!isHttpMethod(method) || !operation) {
					continue;
				}

				const toolName = buildToolName(method, path, operation);
				const description = [
					operation.summary,
					operation.description,
					`Method: ${method.toUpperCase()}`,
					`Path: ${path}`,
				]
					.filter(Boolean)
					.join("\n\n");

				const inputSchema = buildInputSchema(operation);

				mcpServer.registerTool(
					toolName,
					{
						description,
						inputSchema,
					},
					async (args) => {
						try {
							const baseUrl = "http://localhost";
							const { url, init } = buildRequest(
								baseUrl,
								path,
								method,
								args as Record<string, unknown>,
							);

							const headers = new Headers(init.headers);
							const context = getContext<HonoVariables>();
							// OAuth flow: the provider validated the bearer token and
							// decrypted our props — the pouch JWT minted at consent time
							// lives there, not in the incoming Authorization header (which
							// holds the opaque library token). Header-capable clients fall
							// back to the plain bearer path.
							const props = (
								context.executionCtx as unknown as {
									props?: { accessToken?: string };
								}
							).props;
							const authHeader = props?.accessToken
								? `Bearer ${props.accessToken}`
								: (context.req.header("authorization") ??
									context.var.accessToken);
							if (authHeader) {
								headers.set("authorization", authHeader);
							}

							const request = new Request(url, {
								...init,
								headers,
							});

							const response = await app.fetch(
								request,
								context.env,
								context.executionCtx,
							);

							const responseText = await response.text();
							const text = truncateText(responseText, MAX_RESPONSE_CHARS);

							return {
								isError: !response.ok,
								content: [
									{
										type: "text" as const,
										text: `HTTP ${response.status}\n\n${text}`,
									},
								],
							};
						} catch (error) {
							const message =
								error instanceof Error ? error.message : "Unknown error";

							return {
								isError: true,
								content: [
									{
										type: "text" as const,
										text: `Tool failed: ${message}`,
									},
								],
							};
						}
					},
				);
			}
		}

		hasRegisteredTools = true;
	};

	const router = createRouter().all("/", async (c) => {
		const accessToken = c.req.query("access_token");
		if (accessToken) {
			c.set("accessToken", `Bearer ${accessToken}`);
		}

		if (!mcpServer.isConnected()) {
			await registerToolsFromOpenApi(c.var.deps);
			await mcpServer.connect(transport);
		}

		return transport.handleRequest(c);
	});

	return router;
};
