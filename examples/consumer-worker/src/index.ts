import createClient from "openapi-fetch";
import type { paths } from "./generated/pouch";

const createPouchClient = ({ env }: { env: Env }) =>
	createClient<paths>({
		baseUrl: "https://pouch",
		headers: { Authorization: `Bearer ${env.POUCH_TOKEN}` },
		fetch: (input) => env.POUCH.fetch(input),
	});

export default {
	async fetch(request, env): Promise<Response> {
		const pouch = createPouchClient({ env });

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
	},
} satisfies ExportedHandler<Env>;
