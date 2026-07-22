import { createMiddleware } from "hono/factory";

import { AppHTTPException, ErrorCodes } from "@/lib/errors";

export const SCOPES = [
	"content:read",
	"content:write",
	"collection:read",
	"collection:write",
	"media:read",
	"media:write",
	"audit:read",
] as const;
export type Scope = (typeof SCOPES)[number];

const getScopes = (payload: unknown): Scope[] => {
	const scopes = (payload as Record<string, unknown>)?.["scopes"];
	return Array.isArray(scopes) ? (scopes as Scope[]) : [];
};

/**
 * Collection slugs the token is restricted to, or null when unrestricted.
 * An empty array means nothing is permitted (a key created with
 * `collections: []` can never match a slug).
 */
export const getPermittedCollections = (payload: unknown): string[] | null => {
	const collections = (payload as Record<string, unknown> | undefined)?.[
		"collections"
	];
	if (!Array.isArray(collections)) return null;
	return collections.map(String);
};

export const requireScopes = (...requiredScopes: Scope[]) =>
	createMiddleware(async (c, next) => {
		const payload = c.var.jwtPayload;

		if (!payload) {
			throw new AppHTTPException({
				code: ErrorCodes.UNAUTHORIZED,
				message: "Missing or invalid token",
				status: 401,
			});
		}

		const scopes = getScopes(payload);

		const missingScopes = requiredScopes.filter(
			(scope) => !scopes.includes(scope),
		);

		if (missingScopes.length > 0) {
			throw new AppHTTPException({
				code: ErrorCodes.UNAUTHORIZED,
				message: `Missing required scopes: ${missingScopes.join(", ")}`,
				status: 403,
			});
		}

		await next();
	});

/**
 * Enforces the token's per-collection restriction on routes with a `:slug`
 * param. Unrestricted tokens (no `collections` claim) pass through. Mounted
 * after requireScopes, which owns the 401 for missing tokens.
 */
export const requireCollectionAccess = () =>
	createMiddleware(async (c, next) => {
		const permittedCollections = getPermittedCollections(c.var.jwtPayload);
		if (permittedCollections === null) {
			await next();
			return;
		}

		const slug = c.req.param("slug");
		const hasAccess = slug !== undefined && permittedCollections.includes(slug);

		if (!hasAccess) {
			throw new AppHTTPException({
				code: ErrorCodes.UNAUTHORIZED,
				message: "Token is not permitted for this collection",
				status: 403,
			});
		}

		await next();
	});
