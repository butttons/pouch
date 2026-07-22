import type { Hono } from "hono";
import { getContext } from "hono/context-storage";
import { Result, ResultAsync } from "neverthrow";

import type { HonoVariables } from "@/utils";

import type { HttpMethod, ToolDefinition } from "./_types";

const MAX_RESPONSE_CHARS = 50_000;

const truncateText = (input: { text: string; maxLength: number }): string => {
	if (input.text.length <= input.maxLength) {
		return input.text;
	}

	return `${input.text.slice(0, input.maxLength)}\n\n[truncated ${input.text.length - input.maxLength} characters]`;
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

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonBody = (input: {
	text: string;
}): { hasValue: boolean; value?: unknown } => {
	if (!input.text) {
		return { hasValue: false };
	}
	const parsed = Result.fromThrowable(
		() => JSON.parse(input.text) as unknown,
		() => "invalid json",
	)();
	return parsed.isOk()
		? { hasValue: true, value: parsed.value }
		: { hasValue: false };
};

/**
 * Shapes a success body into structuredContent matching the tool's declared
 * outputSchema: empty bodies (204) become an empty object, wrapped tools nest
 * non-object bodies under their wrapKey, plain objects pass through as-is.
 */
const toStructuredContent = (input: {
	body: { hasValue: boolean; value?: unknown };
	wrapKey?: string;
}): Record<string, unknown> | undefined => {
	if (!input.body.hasValue) {
		return {};
	}
	if (input.wrapKey) {
		return { [input.wrapKey]: input.body.value };
	}
	if (isPlainObject(input.body.value)) {
		return input.body.value;
	}
	return undefined;
};

export const executeTool = (input: {
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
			: context.req.header("authorization");
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

		// structuredContent mirrors the success body so clients validating
		// against outputSchema (e.g. ChatGPT) get a conforming payload. Error
		// bodies stay text-only: they never match the success schema.
		const structuredContent =
			response.ok && input.tool.outputSchema
				? toStructuredContent({
						body: parseJsonBody({ text: responseText }),
						wrapKey: input.tool.outputWrapKey,
					})
				: undefined;

		return {
			isError: !response.ok,
			content: [
				{
					type: "text" as const,
					text: `HTTP ${response.status}\n\n${text}`,
				},
			],
			...(structuredContent ? { structuredContent } : {}),
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
