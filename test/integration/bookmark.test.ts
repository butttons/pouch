import { describe, expect, it } from "vitest";

import { createCollection, fetchWorker, readerToken } from "../utils.js";

describe("read replication bookmark header", () => {
	it("returns x-d1-bookmark when a bookmark is provided", async () => {
		await createCollection({
			slug: "bookmark-test",
			name: "Bookmark Test",
			schema: {
				type: "object",
				properties: {
					title: { type: "string" },
				},
				required: ["title"],
				additionalProperties: false,
			},
		});

		const token = await readerToken();
		const response = await fetchWorker(
			"/collections/bookmark-test/content",
			{
				headers: {
					"x-d1-bookmark": "first-unconstrained",
				},
			},
			token,
		);

		expect(response.status).toBe(200);
		const bookmark = response.headers.get("x-d1-bookmark");
		expect(bookmark).toBeTruthy();
	});

	it("does not return x-d1-bookmark when no bookmark is provided", async () => {
		await createCollection({
			slug: "bookmark-test-no-header",
			name: "Bookmark Test No Header",
			schema: {
				type: "object",
				properties: {
					title: { type: "string" },
				},
				required: ["title"],
				additionalProperties: false,
			},
		});

		const token = await readerToken();
		const response = await fetchWorker(
			"/collections/bookmark-test-no-header/content",
			{},
			token,
		);

		expect(response.status).toBe(200);
		const bookmark = response.headers.get("x-d1-bookmark");
		expect(bookmark).toBeNull();
	});
});
