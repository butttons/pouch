import createClient from "openapi-fetch";
import type { paths } from "./generated/pouch";

const cache = caches.default;

// One week. Entries are not expected to expire — mutations purge by tag
// long before that. This is only a storage backstop.
const CACHE_TTL_SECONDS = 604800;

// Maps resolve= field names to the collection they point at, mirroring the
// x-relation targets in the pouch schemas. A resolved field embeds another
// collection's data in the response, so that collection's tag must be
// stamped on the cache entry too.
const RESOLVE_TARGETS: Record<string, string> = {
	author: "authors",
};

const collectionTag = ({ slug }: { slug: string }) => `col-${slug}`;

const tagsForRequest = ({ url }: { url: URL }): string[] => {
	const match = url.pathname.match(
		/^\/collections\/([^/]+)\/content(?:\/([^/]+))?/,
	);
	if (!match) {
		return [];
	}

	const tags = [collectionTag({ slug: match[1] })];
	if (match[2]) {
		tags.push(`con-${match[2]}`);
	}

	const resolved = url.searchParams.get("resolve")?.split(",") ?? [];
	for (const field of resolved) {
		const target = RESOLVE_TARGETS[field];
		if (target) {
			tags.push(collectionTag({ slug: target }));
		}
	}

	return tags;
};

const purgeTags = async ({
	env,
	tags,
}: {
	env: Env;
	tags: string[];
}): Promise<void> => {
	if (!env.CF_ZONE_ID || !env.CF_API_TOKEN) {
		console.log(`PURGE SKIPPED (no zone credentials) tags=${tags.join(",")}`);
		return;
	}

	const response = await fetch(
		`https://api.cloudflare.com/client/v4/zones/${env.CF_ZONE_ID}/purge_cache`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.CF_API_TOKEN}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ tags }),
		},
	);
	console.log(`PURGE tags=${tags.join(",")} status=${response.status}`);
};

const createPouchClient = ({
	env,
	ctx,
}: {
	env: Env;
	ctx: ExecutionContext;
}) =>
	createClient<paths>({
		baseUrl: "https://pouch",
		headers: { Authorization: `Bearer ${env.POUCH_TOKEN}` },
		fetch: async (request) => {
			const url = new URL(request.url);

			if (request.method !== "GET") {
				const upstream = await env.POUCH.fetch(request);
				const slug = url.pathname.match(/^\/collections\/([^/]+)\//)?.[1];
				if (upstream.ok && slug) {
					ctx.waitUntil(
						purgeTags({ env, tags: [collectionTag({ slug })] }),
					);
				}
				return upstream;
			}

			const cacheKey = new Request(url, request);
			const cached = await cache.match(cacheKey);
			if (cached) {
				console.log(`CACHE HIT ${url.pathname}${url.search}`);
				return cached;
			}

			console.log(`CACHE MISS ${url.pathname}${url.search}`);
			const upstream = await env.POUCH.fetch(request);
			if (!upstream.ok) {
				return upstream;
			}

			const response = new Response(upstream.body, upstream);
			response.headers.set(
				"Cache-Control",
				`s-maxage=${CACHE_TTL_SECONDS}`,
			);
			const tags = tagsForRequest({ url });
			if (tags.length > 0) {
				response.headers.set("Cache-Tag", tags.join(","));
			}
			ctx.waitUntil(cache.put(cacheKey, response.clone()));
			console.log(`CACHE PUT ${url.pathname}${url.search} tags=${tags.join(",")}`);
			return response;
		},
	});

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		const pouch = createPouchClient({ env, ctx });

		if (request.method === "GET" && url.pathname === "/") {
			const { data, error } = await pouch.GET(
				"/collections/articles/content",
				{
					params: {
						query: { "views[gte]": 50, resolve: "author" },
					},
				},
			);
			if (error) {
				return Response.json({ error }, { status: 502 });
			}
			return Response.json(data);
		}

		if (request.method === "GET" && url.pathname.startsWith("/articles/")) {
			const id = url.pathname.split("/").at(-1) ?? "";
			const { data, error } = await pouch.GET(
				"/collections/articles/content/{id}",
				{ params: { path: { id }, query: { resolve: "author" } } },
			);
			if (error) {
				return Response.json({ error }, { status: 502 });
			}
			return Response.json(data);
		}

		if (request.method === "POST" && url.pathname === "/touch") {
			const list = await pouch.GET("/collections/articles/content", {
				params: { query: { limit: 1 } },
			});
			const article = list.data?.data[0];
			if (!article) {
				return Response.json({ error: "no articles" }, { status: 404 });
			}

			const { data, error } = await pouch.PATCH(
				"/collections/articles/content/{id}",
				{
					params: { path: { id: article.id } },
					body: {
						data: {
							...article.data,
							author:
								typeof article.data.author === "string"
									? article.data.author
									: article.data.author.id,
							views: (article.data.views ?? 0) + 1,
						},
					},
				},
			);
			if (error) {
				return Response.json({ error }, { status: 502 });
			}
			return Response.json(data);
		}

		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;
