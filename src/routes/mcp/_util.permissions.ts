import type { Context } from "hono";
import { decode } from "hono/jwt";
import { Result } from "neverthrow";

import { getPermittedCollections } from "@/middleware/auth";
import type { HonoVariables } from "@/utils";

import type { ToolDefinition } from "./_types";

/**
 * Resolves the pouch JWT for this request: from OAuth props (consent flow)
 * or the Authorization header (plain bearer).
 */
const resolvePouchToken = (c: Context<HonoVariables>): string | undefined => {
	const props = (
		c.executionCtx as unknown as { props?: { accessToken?: string } }
	).props;
	if (props?.accessToken) return props.accessToken;

	const header = c.req.header("authorization");
	if (header?.startsWith("Bearer ")) return header.slice(7);

	return undefined;
};

/**
 * Reads the token's per-collection restriction for tool-list filtering. The
 * token is already verified upstream (OAuthProvider or execution-time auth);
 * decoding here is a UX filter, not a security boundary.
 */
export const resolvePermittedCollections = (
	c: Context<HonoVariables>,
): string[] | null => {
	const token = resolvePouchToken(c);
	if (!token) return null;
	const payload = Result.fromThrowable(
		() => decode(token).payload,
		() => null,
	)().unwrapOr(null);
	return getPermittedCollections(payload);
};

/**
 * Matches any path bound to a concrete collection slug. Parameterized static
 * paths keep their `{slug}` placeholder and never match — they stay visible
 * and rely on execution-time enforcement.
 */
const CONCRETE_COLLECTION_PATH_PATTERN = /^\/collections\/([^/{}]+)(?=\/|$)/;

export const isToolPermitted = (input: {
	tool: ToolDefinition;
	permittedCollections: string[] | null;
}): boolean => {
	if (input.permittedCollections === null) return true;
	const match = CONCRETE_COLLECTION_PATH_PATTERN.exec(input.tool.path);
	if (!match) return true;
	return input.permittedCollections.includes(match[1] ?? "");
};
