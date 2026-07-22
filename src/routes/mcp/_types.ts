export const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;

export type HttpMethod = (typeof HTTP_METHODS)[number];

export const EXCLUDED_PATH_PREFIXES = ["/auth", "/mcp", "/openapi.json"];

export type OpenApiParameter = {
	name: string;
	in: "path" | "query" | "header";
	required?: boolean;
	schema?: Record<string, unknown>;
};

export type OpenApiResponse = {
	description?: string;
	content?: Record<string, { schema?: Record<string, unknown> }>;
};

export type OpenApiOperation = {
	operationId?: string;
	summary?: string;
	description?: string;
	tags?: string[];
	parameters?: OpenApiParameter[];
	requestBody?: {
		required?: boolean;
		content?: Record<string, { schema: Record<string, unknown> }>;
	};
	responses?: Record<string, OpenApiResponse>;
};

export type OpenApiPathItem = Partial<Record<HttpMethod, OpenApiOperation>>;

export type OpenApiDocument = {
	paths?: Record<string, OpenApiPathItem>;
	components?: { schemas?: Record<string, unknown> };
};

export type ToolDefinition = {
	name: string;
	title?: string;
	description: string;
	inputSchema: Record<string, unknown>;
	outputSchema?: Record<string, unknown>;
	/** Key wrapping non-object success bodies inside structuredContent. */
	outputWrapKey?: string;
	annotations: Record<string, unknown>;
	method: HttpMethod;
	path: string;
};

export type ToolOutputShape = {
	outputSchema: Record<string, unknown>;
	wrapKey?: string;
};

export const isHttpMethod = (value: string): value is HttpMethod =>
	HTTP_METHODS.includes(value as HttpMethod);

export const isExcludedPath = (path: string): boolean =>
	EXCLUDED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
