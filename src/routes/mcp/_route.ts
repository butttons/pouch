import { StreamableHTTPTransport } from "@hono/mcp";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	ErrorCode,
	ListToolsRequestSchema,
	McpError,
} from "@modelcontextprotocol/sdk/types.js";
import type { Hono } from "hono";

import { assembleOpenAPIDocument } from "@/lib/openapi";

import { createRouter, type HonoVariables } from "@/utils";

import packageJson from "../../../package.json";
import { executeTool } from "./_service.execute";
import type { OpenApiDocument } from "./_types";
import {
	isToolPermitted,
	resolvePermittedCollections,
} from "./_util.permissions";
import { buildToolsFromOpenApi } from "./_util.tools";

/**
 * Fully stateless: every request gets a fresh Server + transport with tools
 * built from a freshly assembled OpenAPI document. No session mode
 * (sessionIdGenerator stays undefined) because session affinity is not
 * guaranteed across Workers isolates — and no shared registration state, so
 * the tool list always reflects the collections that exist right now.
 */
export const createMcpRouter = (app: Hono<HonoVariables>) => {
	const router = createRouter().all("/", async (c) => {
		const server = new Server(
			{ name: "pouch", version: packageJson.version },
			{ capabilities: { tools: {} } },
		);

		const result = await assembleOpenAPIDocument(c.var.deps);
		const permittedCollections = resolvePermittedCollections(c);
		const tools = result.isOk()
			? buildToolsFromOpenApi({ spec: result.value as OpenApiDocument }).filter(
					(tool) => isToolPermitted({ tool, permittedCollections }),
				)
			: [];

		server.setRequestHandler(ListToolsRequestSchema, () => ({
			tools: tools.map(
				({
					name,
					title,
					description,
					inputSchema,
					outputSchema,
					annotations,
				}) => ({
					name,
					...(title ? { title } : {}),
					description,
					inputSchema,
					...(outputSchema ? { outputSchema } : {}),
					annotations,
				}),
			),
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
