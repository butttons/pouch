import { describe, expect, it } from "vitest";

import {
	adminToken,
	createCollection,
	fetchWorker,
	readerToken,
} from "../utils.js";

type JsonRpcResponse = {
	jsonrpc: string;
	id: number;
	result?: { tools?: McpTool[] };
	error?: { code: number; message: string };
};

type SchemaNode = {
	type?: string;
	properties?: Record<string, SchemaNode>;
	required?: string[];
	items?: SchemaNode;
	pattern?: string;
	enum?: unknown[];
};

type McpTool = {
	name: string;
	description?: string;
	inputSchema: SchemaNode;
};

type OpenApiSpec = {
	paths: Record<string, unknown>;
	components?: { schemas?: Record<string, unknown> };
};

const mcpRequest = async (input: {
	method: string;
	params?: unknown;
	token: string;
}): Promise<JsonRpcResponse> => {
	const response = await fetchWorker("/mcp", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json, text/event-stream",
			Authorization: `Bearer ${input.token}`,
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: input.method,
			params: input.params,
		}),
	});

	const text = await response.text();
	const dataLine = text.split("\n").find((line) => line.startsWith("data: "));
	if (!dataLine) {
		throw new Error(`No SSE data in /mcp response: ${text.slice(0, 200)}`);
	}
	return JSON.parse(dataLine.slice("data: ".length)) as JsonRpcResponse;
};

const listTools = async (input: { token: string }): Promise<McpTool[]> => {
	const response = await mcpRequest({
		method: "tools/list",
		token: input.token,
	});
	return response.result?.tools ?? [];
};

const COMPONENTS_SCHEMAS_PREFIX = "#/components/schemas/";

/** Recursively collects every local `#/components/schemas/*` ref target name. */
const collectComponentRefs = (input: { node: unknown }): string[] => {
	const refs: string[] = [];

	const walk = (node: unknown) => {
		if (Array.isArray(node)) {
			node.forEach(walk);
			return;
		}
		if (!node || typeof node !== "object") {
			return;
		}
		for (const [key, value] of Object.entries(node)) {
			if (
				key === "$ref" &&
				typeof value === "string" &&
				value.startsWith(COMPONENTS_SCHEMAS_PREFIX)
			) {
				refs.push(value.slice(COMPONENTS_SCHEMAS_PREFIX.length));
			} else {
				walk(value);
			}
		}
	};

	walk(input.node);
	return refs;
};

const widgetSchema = {
	type: "object",
	properties: {
		title: { type: "string" },
		price: { type: "number" },
	},
	required: ["title"],
};

describe("GET /openapi.json", () => {
	it("has no dangling refs into components.schemas", async () => {
		await createCollection({
			slug: "spec_widgets",
			name: "Spec Widgets",
			schema: widgetSchema,
		});

		const token = await readerToken();
		const response = await fetchWorker("/openapi.json", {}, token);
		expect(response.status).toBe(200);

		const spec = (await response.json()) as OpenApiSpec;
		const schemaNames = Object.keys(spec.components?.schemas ?? {});
		const refs = collectComponentRefs({ node: spec });

		expect(refs.length).toBeGreaterThan(0);
		for (const ref of refs) {
			expect(
				schemaNames,
				`dangling $ref: ${COMPONENTS_SCHEMAS_PREFIX}${ref}`,
			).toContain(ref);
		}
	});

	it("exposes content paths for each collection", async () => {
		await createCollection({
			slug: "spec_paths",
			name: "Spec Paths",
			schema: widgetSchema,
		});

		const token = await readerToken();
		const response = await fetchWorker("/openapi.json", {}, token);
		const spec = (await response.json()) as OpenApiSpec;

		expect(spec.paths).toHaveProperty("/collections/spec_paths/content");
		expect(spec.paths).toHaveProperty("/collections/spec_paths/content/batch");
		expect(spec.paths).toHaveProperty(
			"/collections/spec_paths/content:validate",
		);
		expect(spec.paths).toHaveProperty("/collections/spec_paths/content/{id}");
	});
});

describe("POST /mcp tools/list", () => {
	it("registers snake_case content tools for existing collections", async () => {
		await createCollection({
			slug: "mcp_widgets",
			name: "MCP Widgets",
			schema: widgetSchema,
		});

		const token = await adminToken();
		const tools = await listTools({ token });
		const names = tools.map((tool) => tool.name);

		expect(names).toEqual(
			expect.arrayContaining([
				"list_mcp_widgets_content",
				"create_mcp_widgets_content",
				"create_mcp_widgets_content_batch",
				"update_mcp_widgets_content",
				"update_mcp_widgets_content_batch",
				"delete_mcp_widgets_content",
				"delete_mcp_widgets_content_batch",
				"validate_mcp_widgets_content",
				"get_mcp_widgets_content_by_id",
			]),
		);
	});

	it("exposes fully resolved request body schemas", async () => {
		await createCollection({
			slug: "mcp_typed",
			name: "MCP Typed",
			schema: widgetSchema,
		});

		const token = await adminToken();
		const tools = await listTools({ token });

		const createTool = tools.find(
			(tool) => tool.name === "create_mcp_typed_content",
		);
		expect(createTool).toBeDefined();
		const createBody = createTool!.inputSchema.properties!.body!;
		expect(createBody.properties!.data).toEqual(widgetSchema);
		expect(createBody.required).toContain("data");

		const batchUpdateTool = tools.find(
			(tool) => tool.name === "update_mcp_typed_content_batch",
		);
		expect(batchUpdateTool).toBeDefined();
		const batchBody = batchUpdateTool!.inputSchema.properties!.body!;
		const item = batchBody.properties!.items!.items!;
		const itemProperties = item.properties!;
		expect(itemProperties.id).toEqual({ type: "string", pattern: "^con_" });
		expect(itemProperties.data).toEqual(widgetSchema);
		expect(item.required).toContain("id");
	});

	it("contains no unresolved $ref in any tool input schema", async () => {
		await createCollection({
			slug: "mcp_refs",
			name: "MCP Refs",
			schema: widgetSchema,
		});

		const token = await adminToken();
		const tools = await listTools({ token });
		expect(tools.length).toBeGreaterThan(0);

		for (const tool of tools) {
			const refs = collectComponentRefs({ node: tool.inputSchema });
			expect(refs, `unresolved $ref in tool ${tool.name}`).toEqual([]);
		}
	});

	it("reflects collections created after previous requests", async () => {
		const token = await adminToken();

		const before = await listTools({ token });
		expect(before.some((tool) => tool.name.includes("mcp_fresh"))).toBe(false);

		await createCollection({
			slug: "mcp_fresh",
			name: "MCP Fresh",
			schema: widgetSchema,
		});

		const after = await listTools({ token });
		expect(after.some((tool) => tool.name === "create_mcp_fresh_content")).toBe(
			true,
		);
	});
});
