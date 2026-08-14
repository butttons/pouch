import { describe, expect, it } from "vitest";

import {
	createCollection,
	createContent,
	createContentBatch,
	fetchWorker,
	readerToken,
	writerToken,
} from "../utils.js";

const makeSchema = () => ({
	type: "object",
	properties: {
		title: { type: "string" },
	},
	required: ["title"],
	additionalProperties: false,
});

const titles = (body: { data: Array<{ data: Record<string, unknown> }> }) =>
	body.data.map((item) => item.data.title as string);

describe("sorting", () => {
	it("sorts by ?sort=createdAt ascending (default is newest first)", async () => {
		await createCollection({
			slug: "sort-created",
			name: "Sort Created",
			schema: makeSchema(),
		});

		await createContent("sort-created", { data: { title: "first" } });
		await createContent("sort-created", { data: { title: "second" } });
		await createContent("sort-created", { data: { title: "third" } });

		const token = await readerToken();

		const defaultResponse = await fetchWorker(
			"/collections/sort-created/content",
			{},
			token,
		);
		expect(titles(await defaultResponse.json())).toEqual([
			"third",
			"second",
			"first",
		]);

		const ascResponse = await fetchWorker(
			"/collections/sort-created/content?sort=createdAt",
			{},
			token,
		);
		expect(ascResponse.status).toBe(200);
		expect(titles(await ascResponse.json())).toEqual([
			"first",
			"second",
			"third",
		]);
	});

	it("sorts by ?sort=updatedAt with patched items last", async () => {
		await createCollection({
			slug: "sort-updated",
			name: "Sort Updated",
			schema: makeSchema(),
		});

		const a = await createContent("sort-updated", { data: { title: "A" } });
		await createContent("sort-updated", { data: { title: "B" } });

		const writer = await writerToken();
		const patch = await fetchWorker(
			`/collections/sort-updated/content/${a.id}`,
			{
				method: "PATCH",
				body: JSON.stringify({ data: { title: "A2" } }),
			},
			writer,
		);
		expect(patch.status).toBe(200);

		const token = await readerToken();
		const response = await fetchWorker(
			"/collections/sort-updated/content?sort=updatedAt",
			{},
			token,
		);
		expect(response.status).toBe(200);
		expect(titles(await response.json())).toEqual(["B", "A2"]);
	});

	it("paginates sorted results with the returned cursor", async () => {
		await createCollection({
			slug: "sort-paginate",
			name: "Sort Paginate",
			schema: makeSchema(),
		});

		await createContentBatch("sort-paginate", [
			{ data: { title: "one" } },
			{ data: { title: "two" } },
			{ data: { title: "three" } },
		]);

		const token = await readerToken();
		const page1 = await fetchWorker(
			"/collections/sort-paginate/content?sort=createdAt&limit=2",
			{},
			token,
		);
		expect(page1.status).toBe(200);
		const page1Body = (await page1.json()) as {
			data: Array<{ data: Record<string, unknown> }>;
			nextCursor: string | null;
		};
		expect(page1Body.data).toHaveLength(2);
		expect(page1Body.nextCursor).not.toBeNull();

		const page2 = await fetchWorker(
			`/collections/sort-paginate/content?sort=createdAt&limit=2&cursor=${encodeURIComponent(page1Body.nextCursor!)}`,
			{},
			token,
		);
		expect(page2.status).toBe(200);
		const page2Body = (await page2.json()) as {
			data: Array<{ data: Record<string, unknown> }>;
			nextCursor: string | null;
		};
		expect(page2Body.data).toHaveLength(1);
		expect(page2Body.nextCursor).toBeNull();

		// Batch-created rows can share created_at; the (created_at, id) keyset
		// must still page through every row exactly once.
		const all = [...titles(page1Body), ...titles(page2Body)];
		expect(all.sort()).toEqual(["one", "three", "two"]);
	});

	it("rejects an unknown sort field", async () => {
		await createCollection({
			slug: "sort-invalid",
			name: "Sort Invalid",
			schema: makeSchema(),
		});

		const token = await readerToken();
		const response = await fetchWorker(
			"/collections/sort-invalid/content?sort=title",
			{},
			token,
		);
		expect(response.status).toBe(400);

		const body = (await response.json()) as { code: string };
		expect(body.code).toBe("VALIDATION_FAILED");
	});

	it("rejects a malformed cursor when sorting", async () => {
		await createCollection({
			slug: "sort-bad-cursor",
			name: "Sort Bad Cursor",
			schema: makeSchema(),
		});

		const token = await readerToken();
		const response = await fetchWorker(
			"/collections/sort-bad-cursor/content?sort=createdAt&cursor=not-a-cursor",
			{},
			token,
		);
		expect(response.status).toBe(400);

		const body = (await response.json()) as { code: string };
		expect(body.code).toBe("VALIDATION_FAILED");
	});

	it("sorts by an x-index string data field", async () => {
		await createCollection({
			slug: "sort-indexed-string",
			name: "Sort Indexed String",
			schema: {
				type: "object",
				properties: {
					title: { type: "string" },
					label: { type: "string", "x-index": true },
				},
				required: ["title", "label"],
				additionalProperties: false,
			},
		});

		await createContent("sort-indexed-string", {
			data: { title: "A", label: "beta" },
		});
		await createContent("sort-indexed-string", {
			data: { title: "B", label: "alpha" },
		});
		await createContent("sort-indexed-string", {
			data: { title: "C", label: "gamma" },
		});

		const token = await readerToken();

		const ascResponse = await fetchWorker(
			"/collections/sort-indexed-string/content?sort=label",
			{},
			token,
		);
		expect(ascResponse.status).toBe(200);
		expect(titles(await ascResponse.json())).toEqual(["B", "A", "C"]);

		const descResponse = await fetchWorker(
			"/collections/sort-indexed-string/content?sort=-label",
			{},
			token,
		);
		expect(descResponse.status).toBe(200);
		expect(titles(await descResponse.json())).toEqual(["C", "A", "B"]);
	});

	it("sorts by an x-index integer data field and paginates across a boundary", async () => {
		await createCollection({
			slug: "sort-indexed-int",
			name: "Sort Indexed Int",
			schema: {
				type: "object",
				properties: {
					title: { type: "string" },
					rank: { type: "integer", "x-index": true },
				},
				required: ["title", "rank"],
				additionalProperties: false,
			},
		});

		await createContent("sort-indexed-int", { data: { title: "A", rank: 30 } });
		await createContent("sort-indexed-int", { data: { title: "B", rank: 10 } });
		await createContent("sort-indexed-int", { data: { title: "C", rank: 20 } });
		await createContent("sort-indexed-int", { data: { title: "D", rank: 40 } });

		const token = await readerToken();

		const page1 = await fetchWorker(
			"/collections/sort-indexed-int/content?sort=rank&limit=2",
			{},
			token,
		);
		expect(page1.status).toBe(200);
		const page1Body = (await page1.json()) as {
			data: Array<{ data: Record<string, unknown> }>;
			nextCursor: string | null;
		};
		expect(titles(page1Body)).toEqual(["B", "C"]);
		expect(page1Body.nextCursor).not.toBeNull();

		const page2 = await fetchWorker(
			`/collections/sort-indexed-int/content?sort=rank&limit=2&cursor=${encodeURIComponent(page1Body.nextCursor!)}`,
			{},
			token,
		);
		expect(page2.status).toBe(200);
		const page2Body = (await page2.json()) as {
			data: Array<{ data: Record<string, unknown> }>;
			nextCursor: string | null;
		};
		expect(titles(page2Body)).toEqual(["A", "D"]);
		expect(page2Body.nextCursor).toBeNull();

		// Descending pagination across a boundary.
		const descPage1 = await fetchWorker(
			"/collections/sort-indexed-int/content?sort=-rank&limit=2",
			{},
			token,
		);
		expect(descPage1.status).toBe(200);
		const descPage1Body = (await descPage1.json()) as {
			data: Array<{ data: Record<string, unknown> }>;
			nextCursor: string | null;
		};
		expect(titles(descPage1Body)).toEqual(["D", "A"]);
		expect(descPage1Body.nextCursor).not.toBeNull();

		const descPage2 = await fetchWorker(
			`/collections/sort-indexed-int/content?sort=-rank&limit=2&cursor=${encodeURIComponent(descPage1Body.nextCursor!)}`,
			{},
			token,
		);
		expect(descPage2.status).toBe(200);
		const descPage2Body = (await descPage2.json()) as {
			data: Array<{ data: Record<string, unknown> }>;
			nextCursor: string | null;
		};
		expect(titles(descPage2Body)).toEqual(["C", "B"]);
		expect(descPage2Body.nextCursor).toBeNull();
	});

	it("rejects a non-indexed field as a sort field", async () => {
		await createCollection({
			slug: "sort-non-indexed",
			name: "Sort Non Indexed",
			schema: makeSchema(),
		});

		const token = await readerToken();
		const response = await fetchWorker(
			"/collections/sort-non-indexed/content?sort=title",
			{},
			token,
		);
		expect(response.status).toBe(400);

		const body = (await response.json()) as { code: string };
		expect(body.code).toBe("VALIDATION_FAILED");
	});
});
