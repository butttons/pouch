import { createMiddleware } from "hono/factory";
import { verify } from "hono/jwt";

import { createDeps } from "@/deps";
import { d1BookmarkSchema } from "@/lib/openapi-helpers";
import { isValid } from "@/lib/validator";

import type { HonoVariables } from "@/utils";

type HonoContext = Parameters<
	Parameters<typeof createMiddleware<HonoVariables>>[0]
>[0];

const getClientIp = (c: HonoContext) =>
	c.req.header("cf-connecting-ip") ?? "unknown";

const resolveJwtPayload = async (
	c: HonoContext,
): Promise<Record<string, unknown> | undefined> => {
	const authHeader = c.req.header("authorization");

	if (!authHeader?.startsWith("Bearer ")) {
		return undefined;
	}

	const token = authHeader.slice(7);

	try {
		return await verify(token, c.env.JWT_SECRET, "HS256");
	} catch {
		return undefined;
	}
};

const resolveActor = (
	payload: Record<string, unknown> | undefined,
	ip: string,
) => {
	const jti = typeof payload?.jti === "string" ? payload.jti : undefined;
	const name = typeof payload?.name === "string" ? payload.name : undefined;

	if (jti && name) return `${jti}:${name}`;
	if (jti) return jti;
	if (name) return name;
	return `ip_${ip}`;
};

export const depsMiddleware = createMiddleware<HonoVariables>(
	async (c, next) => {
		const rawBookmark = c.req.header("x-d1-bookmark");
		const bookmark =
			rawBookmark && isValid(rawBookmark, d1BookmarkSchema)
				? rawBookmark
				: undefined;

		const payload = await resolveJwtPayload(c);
		c.set("jwtPayload", payload);

		const actor = resolveActor(payload, getClientIp(c));
		const deps = createDeps({ env: c.env, bookmark, actor });

		c.set("deps", deps);

		await next();

		const nextBookmark = deps.getNextBookmark();
		if (nextBookmark) {
			c.res.headers.set("x-d1-bookmark", nextBookmark);
		}
	},
);
