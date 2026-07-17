import { createMiddleware } from "hono/factory";

import { createDeps } from "../deps";

export const depsMiddleware = createMiddleware(async (c, next) => {
	c.set("deps", createDeps({ env: c.env }));
	await next();
});
