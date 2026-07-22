import { describe, expect, it } from "vitest";

import { createCollection, fetchWorker } from "../utils";
import { env } from "cloudflare:test";

const widgetSchema = {
	type: "object",
	properties: {
		title: { type: "string" },
	},
	required: ["title"],
};

const createScopedKey = async (input: {
	scopes: string[];
	collections?: string[];
}) => {
	const response = await fetchWorker("/auth/keys", {
		method: "POST",
		body: JSON.stringify({
			secret: env.JWT_SECRET,
			name: "scoped-test-key",
			scopes: input.scopes,
			...(input.collections ? { collections: input.collections } : {}),
		}),
	});
	expect(response.status).toBe(201);
	const body = (await response.json()) as { token: string };
	return body.token;
};

describe("per-collection keys", () => {
	const setup = async () => {
		const slug = `scoped-${crypto.randomUUID().slice(0, 8)}`;
		const otherSlug = `other-${crypto.randomUUID().slice(0, 8)}`;
		await createCollection({ slug, name: "Scoped", schema: widgetSchema });
		await createCollection({
			slug: otherSlug,
			name: "Other",
			schema: widgetSchema,
		});
		const token = await createScopedKey({
			scopes: [
				"collection:read",
				"collection:write",
				"content:read",
				"content:write",
			],
			collections: [slug],
		});
		return { slug, otherSlug, token };
	};

	it("echoes the collections restriction in the key response", async () => {
		const response = await fetchWorker("/auth/keys", {
			method: "POST",
			body: JSON.stringify({
				secret: env.JWT_SECRET,
				name: "echo-key",
				scopes: ["content:read"],
				collections: ["faqs"],
			}),
		});

		expect(response.status).toBe(201);
		const body = (await response.json()) as { collections?: string[] };
		expect(body.collections).toEqual(["faqs"]);
	});

	it("reads and writes content in a permitted collection", async () => {
		const { slug, token } = await setup();

		const createResponse = await fetchWorker(
			`/collections/${slug}/content`,
			{
				method: "POST",
				body: JSON.stringify({ data: { title: "Hello" } }),
			},
			token,
		);
		expect(createResponse.status).toBe(201);

		const listResponse = await fetchWorker(
			`/collections/${slug}/content`,
			{},
			token,
		);
		expect(listResponse.status).toBe(200);
	});

	it("forbids content access to other collections", async () => {
		const { otherSlug, token } = await setup();

		const readResponse = await fetchWorker(
			`/collections/${otherSlug}/content`,
			{},
			token,
		);
		expect(readResponse.status).toBe(403);

		const writeResponse = await fetchWorker(
			`/collections/${otherSlug}/content`,
			{
				method: "POST",
				body: JSON.stringify({ data: { title: "Nope" } }),
			},
			token,
		);
		expect(writeResponse.status).toBe(403);
	});

	it("filters the collection list to permitted slugs", async () => {
		const { slug, otherSlug, token } = await setup();

		const response = await fetchWorker("/collections", {}, token);

		expect(response.status).toBe(200);
		const body = (await response.json()) as Array<{ slug: string }>;
		expect(body.some((collection) => collection.slug === slug)).toBe(true);
		expect(body.some((collection) => collection.slug === otherSlug)).toBe(
			false,
		);
	});

	it("forbids schema reads and writes on other collections", async () => {
		const { slug, otherSlug, token } = await setup();

		const schemaResponse = await fetchWorker(
			`/collections/${slug}/schema`,
			{},
			token,
		);
		expect(schemaResponse.status).toBe(200);

		const otherSchemaResponse = await fetchWorker(
			`/collections/${otherSlug}/schema`,
			{},
			token,
		);
		expect(otherSchemaResponse.status).toBe(403);

		const patchResponse = await fetchWorker(
			`/collections/${otherSlug}/schema`,
			{
				method: "PATCH",
				body: JSON.stringify({ schema: widgetSchema }),
			},
			token,
		);
		expect(patchResponse.status).toBe(403);
	});

	it("forbids deleting other collections", async () => {
		const { otherSlug, token } = await setup();

		const response = await fetchWorker(
			`/collections/${otherSlug}`,
			{ method: "DELETE" },
			token,
		);
		expect(response.status).toBe(403);
	});

	it("does not restrict media or audit routes", async () => {
		const token = await createScopedKey({
			scopes: ["media:read", "audit:read"],
			collections: ["nothing-matches-this"],
		});

		const mediaResponse = await fetchWorker("/media", {}, token);
		expect(mediaResponse.status).toBe(200);

		const auditResponse = await fetchWorker("/audit-logs", {}, token);
		expect(auditResponse.status).toBe(200);
	});
});
