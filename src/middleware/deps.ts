import { createMiddleware } from "hono/factory";

import { createDeps } from "@/deps";
import { d1BookmarkSchema } from "@/lib/openapi-helpers";
import { isValid } from "@/lib/validator";

export const depsMiddleware = createMiddleware(async (c, next) => {
	const rawBookmark = c.req.header("x-d1-bookmark");
	const bookmark =
		rawBookmark && isValid(rawBookmark, d1BookmarkSchema)
			? rawBookmark
			: undefined;
	const deps = createDeps({ env: c.env, bookmark });

	c.set("deps", deps);

	await next();

	const nextBookmark = deps.getNextBookmark();
	if (nextBookmark) {
		c.res.headers.set("x-d1-bookmark", nextBookmark);
	}
});
