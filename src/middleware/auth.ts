import { createMiddleware } from "hono/factory";

import { AppHTTPException, ErrorCodes } from "@/lib/errors";

export const SCOPES = [
	"content:read",
	"content:write",
	"schema:admin",
] as const;
export type Scope = (typeof SCOPES)[number];

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

		const scopes = Array.isArray(payload["scopes"])
			? (payload["scopes"] as Scope[])
			: [];

		const hasRequiredScopes = requiredScopes.every((scope) =>
			scopes.includes(scope),
		);

		if (!hasRequiredScopes) {
			throw new AppHTTPException({
				code: ErrorCodes.UNAUTHORIZED,
				message: "Missing required scopes",
				status: 403,
			});
		}

		await next();
	});
