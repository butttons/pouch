import { Hono } from "hono";
import { TrieRouter } from "hono/router/trie-router";

import type { Deps } from "./deps";

export type HonoVariables = {
	Bindings: Env;
	Variables: {
		deps: Deps;
	};
};

export const createRouter = () =>
	new Hono<HonoVariables>({ router: new TrieRouter() });
