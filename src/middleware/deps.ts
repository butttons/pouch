import { createMiddleware } from "hono/factory";

import { createDeps } from "@/deps";

export const depsMiddleware = createMiddleware(async (c, next) => {
	const bookmark = c.req.header("x-d1-bookmark");
	const deps = createDeps({ env: c.env, bookmark });

	c.set("deps", deps);

	await next();

	const nextBookmark = deps.getNextBookmark();
	if (nextBookmark) {
		c.res.headers.set("x-d1-bookmark", nextBookmark);
	}
});
