import { createMiddleware } from "hono/factory";
import { jwt } from "hono/jwt";

import { AppHTTPException, ErrorCodes } from "@/lib/errors";

export const SCOPES = [
	"content:read",
	"content:write",
	"schema:admin",
] as const;
export type Scope = (typeof SCOPES)[number];

export const requireScopes = (...requiredScopes: Scope[]) =>
	createMiddleware(async (c, next) => {
		const jwtMiddleware = jwt({ secret: c.env.JWT_SECRET, alg: "HS256" });

		await jwtMiddleware(c, async () => {
			const payload = c.var.jwtPayload as Record<string, unknown>;
			const scopes = Array.isArray(payload.scopes)
				? (payload.scopes as Scope[])
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
	});
