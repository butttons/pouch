import { createMiddleware } from "hono/factory";

import { AppHTTPException, ErrorCodes } from "@/lib/errors";

import type { HonoVariables } from "@/utils";

/**
 * Cloudflare rate-limit binding middleware. Keys on the token's `jti` when a
 * valid JWT is present; falls back to the client IP for unauthenticated
 * requests (e.g. `/auth/keys`, the OAuth consent flow). Mounted after
 * depsMiddleware, which resolves `jwtPayload`.
 */
export const rateLimitMiddleware = createMiddleware<HonoVariables>(
	async (c, next) => {
		const jti = c.var.jwtPayload?.jti;
		const key =
			typeof jti === "string"
				? jti
				: (c.req.header("cf-connecting-ip") ?? "unknown");

		const { success } = await c.env.RATE_LIMITER.limit({ key });

		if (!success) {
			throw new AppHTTPException({
				code: ErrorCodes.RATE_LIMITED,
				message: "Rate limit exceeded",
				status: 429,
			});
		}

		await next();
	},
);
