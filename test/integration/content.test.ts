import { describe, expect, it } from "vitest";

import {
	adminToken,
	createCollection,
	createContent,
	createContentBatch,
	createMedia,
	deleteContentBatch,
	fetchWorker,
	readerToken,
	updateContentBatch,
	writerToken,
} from "../utils.js";
import { env } from "cloudflare:test";

const makeCollectionSchema = (
	extraProperties: Record<string, unknown> = {},
) => ({
	type: "object",
	properties: {
		title: { type: "string" },
		count: { type: "number" },
		...extraProperties,
	},
	required: ["title", "count"],
	additionalProperties: false,
});

describe("content", () => {
	describe("POST /collections/:slug/content", () => {
		it("rejects data that does not match the collection schema", async () => {
			await createCollection({
				slug: "posts",
				name: "Posts",
				schema: makeCollectionSchema(),
			});

			const token = await writerToken();
			const response = await fetchWorker(
				"/collections/posts/content",
				{
					method: "POST",
					body: JSON.stringify({
						data: { title: 123, count: 1 },
					}),
				},
				token,
			);

			expect(response.status).toBe(400);

			const body = (await response.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_FAILED");

			const row = await env.DB.prepare(
				"SELECT COUNT(*) as count FROM content",
			).first<{ count: number }>();
			expect(row!.count).toBe(0);
		});
	});

	describe("POST /collections/:slug/content/batch", () => {
		it("creates multiple content items in one request", async () => {
			await createCollection({
				slug: "batch-posts",
				name: "Batch Posts",
				schema: makeCollectionSchema(),
			});

			const result = await createContentBatch("batch-posts", [
				{ data: { title: "First", count: 1 } },
				{ data: { title: "Second", count: 2 }, status: "published" },
				{ data: { title: "Third", count: 3 }, status: "archived" },
			]);

			expect(result.data).toHaveLength(3);
			expect(result.data.map((item) => item.data.title)).toEqual([
				"First",
				"Second",
				"Third",
			]);
			expect(result.data.map((item) => item.status)).toEqual([
				"draft",
				"published",
				"archived",
			]);

			const row = await env.DB.prepare(
				"SELECT COUNT(*) as count FROM content",
			).first<{ count: number }>();
			expect(row!.count).toBe(3);
		});

		it("rejects the whole batch when one item is invalid", async () => {
			await createCollection({
				slug: "batch-posts-invalid",
				name: "Batch Posts Invalid",
				schema: makeCollectionSchema(),
			});

			const token = await writerToken();
			const response = await fetchWorker(
				"/collections/batch-posts-invalid/content/batch",
				{
					method: "POST",
					body: JSON.stringify({
						items: [
							{ data: { title: "Valid", count: 1 } },
							{ data: { title: 123, count: 2 } },
						],
					}),
				},
				token,
			);

			expect(response.status).toBe(400);

			const body = (await response.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_FAILED");

			const row = await env.DB.prepare(
				"SELECT COUNT(*) as count FROM content",
			).first<{ count: number }>();
			expect(row!.count).toBe(0);
		});

		it("rejects the batch with invalid media references", async () => {
			await createCollection({
				slug: "batch-articles-invalid",
				name: "Batch Articles Invalid",
				schema: {
					type: "object",
					properties: {
						title: { type: "string" },
						cover: { type: "object", "x-media": true },
					},
					required: ["title"],
					additionalProperties: false,
				},
			});

			const token = await writerToken();
			const response = await fetchWorker(
				"/collections/batch-articles-invalid/content/batch",
				{
					method: "POST",
					body: JSON.stringify({
						items: [
							{
								data: {
									title: "Article",
									cover: {
										id: "med_00000000000000000000000000",
										path: "/missing",
									},
								},
							},
						],
					}),
				},
				token,
			);

			expect(response.status).toBe(400);

			const body = (await response.json()) as { code: string; message: string };
			expect(body.code).toBe("VALIDATION_FAILED");
			expect(body.message).toContain("Media not found");

			const row = await env.DB.prepare(
				"SELECT COUNT(*) as count FROM content",
			).first<{ count: number }>();
			expect(row!.count).toBe(0);
		});

		it("creates content with valid media references in a batch", async () => {
			await createCollection({
				slug: "batch-articles-valid",
				name: "Batch Articles Valid",
				schema: {
					type: "object",
					properties: {
						title: { type: "string" },
						cover: { type: "object", "x-media": true },
					},
					required: ["title"],
					additionalProperties: false,
				},
			});

			const file = new File(["cover"], "cover.png", { type: "image/png" });
			const media = await createMedia(file);

			const result = await createContentBatch("batch-articles-valid", [
				{
					data: {
						title: "Article",
						cover: { id: media.id, path: media.r2Key },
					},
				},
			]);

			expect(result.data).toHaveLength(1);
			expect(result.data[0]!.data.cover).toEqual({
				id: media.id,
				path: `${env.MEDIA_PUBLIC_URL}/${media.r2Key}`,
			});
		});
	});

	describe("PATCH /collections/:slug/content/batch", () => {
		it("updates multiple content items in one request", async () => {
			await createCollection({
				slug: "batch-update",
				name: "Batch Update",
				schema: makeCollectionSchema(),
			});

			const first = await createContent("batch-update", {
				data: { title: "First", count: 1 },
			});
			const second = await createContent("batch-update", {
				data: { title: "Second", count: 2 },
			});

			const result = await updateContentBatch("batch-update", [
				{ id: first.id, data: { count: 10 }, status: "published" },
				{ id: second.id, data: { count: 20 } },
			]);

			expect(result.data).toHaveLength(2);
			const updatedById = new Map(result.data.map((item) => [item.id, item]));

			expect(updatedById.get(first.id)?.data).toEqual({
				title: "First",
				count: 10,
			});
			expect(updatedById.get(first.id)?.status).toBe("published");
			expect(updatedById.get(second.id)?.data).toEqual({
				title: "Second",
				count: 20,
			});
			expect(updatedById.get(second.id)?.status).toBe("draft");
		});

		it("rejects the batch when one item is invalid", async () => {
			await createCollection({
				slug: "batch-update-invalid",
				name: "Batch Update Invalid",
				schema: makeCollectionSchema(),
			});

			const first = await createContent("batch-update-invalid", {
				data: { title: "First", count: 1 },
			});

			const token = await writerToken();
			const response = await fetchWorker(
				"/collections/batch-update-invalid/content/batch",
				{
					method: "PATCH",
					body: JSON.stringify({
						items: [
							{ id: first.id, data: { count: 10 } },
							{ id: first.id, data: { title: 123 } },
						],
					}),
				},
				token,
			);

			expect(response.status).toBe(400);

			const body = (await response.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_FAILED");

			const row = await env.DB.prepare("SELECT data FROM content WHERE id = ?")
				.bind(first.id)
				.first<{ data: string }>();
			expect(JSON.parse(row!.data).count).toBe(1);
		});

		it("returns 404 when an id does not exist in the collection", async () => {
			await createCollection({
				slug: "batch-update-missing",
				name: "Batch Update Missing",
				schema: makeCollectionSchema(),
			});

			const token = await writerToken();
			const response = await fetchWorker(
				"/collections/batch-update-missing/content/batch",
				{
					method: "PATCH",
					body: JSON.stringify({
						items: [
							{ id: "con_00000000000000000000000000", data: { count: 5 } },
						],
					}),
				},
				token,
			);

			expect(response.status).toBe(404);
		});
	});

	describe("DELETE /collections/:slug/content/batch", () => {
		it("deletes multiple content items in one request", async () => {
			await createCollection({
				slug: "batch-delete",
				name: "Batch Delete",
				schema: makeCollectionSchema(),
			});

			const first = await createContent("batch-delete", {
				data: { title: "First", count: 1 },
			});
			const second = await createContent("batch-delete", {
				data: { title: "Second", count: 2 },
			});

			await deleteContentBatch("batch-delete", [first.id, second.id]);

			const row = await env.DB.prepare(
				"SELECT COUNT(*) as count FROM content WHERE collection_id = ?",
			)
				.bind(first.collectionId)
				.first<{ count: number }>();
			expect(row!.count).toBe(0);
		});

		it("returns 404 when an id does not exist in the collection", async () => {
			await createCollection({
				slug: "batch-delete-missing",
				name: "Batch Delete Missing",
				schema: makeCollectionSchema(),
			});

			const token = await writerToken();
			const response = await fetchWorker(
				"/collections/batch-delete-missing/content/batch",
				{
					method: "DELETE",
					body: JSON.stringify({
						ids: ["con_00000000000000000000000000"],
					}),
				},
				token,
			);

			expect(response.status).toBe(404);
		});
	});

	describe("POST /collections/:slug/content:validate", () => {
		it("succeeds for valid data and fails for invalid data without writing", async () => {
			await createCollection({
				slug: "drafts",
				name: "Drafts",
				schema: makeCollectionSchema(),
			});

			const token = await writerToken();

			const validResponse = await fetchWorker(
				"/collections/drafts/content:validate",
				{
					method: "POST",
					body: JSON.stringify({
						data: { title: "Hello", count: 1 },
					}),
				},
				token,
			);

			expect(validResponse.status).toBe(200);

			const validBody = (await validResponse.json()) as { valid: boolean };
			expect(validBody.valid).toBe(true);

			const invalidResponse = await fetchWorker(
				"/collections/drafts/content:validate",
				{
					method: "POST",
					body: JSON.stringify({
						data: { title: "Hello" },
					}),
				},
				token,
			);

			expect(invalidResponse.status).toBe(400);

			const invalidBody = (await invalidResponse.json()) as { code: string };
			expect(invalidBody.code).toBe("VALIDATION_FAILED");

			const row = await env.DB.prepare(
				"SELECT COUNT(*) as count FROM content",
			).first<{ count: number }>();
			expect(row!.count).toBe(0);
		});
	});

	describe("PATCH /collections/:slug/content/:id", () => {
		it("merges partial data and re-validates", async () => {
			await createCollection({
				slug: "items",
				name: "Items",
				schema: makeCollectionSchema(),
			});

			const content = await createContent("items", {
				data: { title: "Original", count: 1 },
			});

			const token = await writerToken();

			const response = await fetchWorker(
				`/collections/items/content/${content.id}`,
				{
					method: "PATCH",
					body: JSON.stringify({
						data: { count: 42 },
					}),
				},
				token,
			);

			expect(response.status).toBe(200);

			const body = (await response.json()) as {
				data: Record<string, unknown>;
				updatedAt: number;
			};

			expect(body.data).toEqual({ title: "Original", count: 42 });
			expect(body.updatedAt).toBeGreaterThan(content.createdAt);

			const invalidResponse = await fetchWorker(
				`/collections/items/content/${content.id}`,
				{
					method: "PATCH",
					body: JSON.stringify({
						data: { title: 123 },
					}),
				},
				token,
			);

			expect(invalidResponse.status).toBe(400);
		});
	});

	describe("GET /collections/:slug/content", () => {
		it("filters with ?field=value and ?field[gt]=value", async () => {
			await createCollection({
				slug: "scores",
				name: "Scores",
				schema: makeCollectionSchema(),
			});

			await createContent("scores", { data: { title: "A", count: 1 } });
			await createContent("scores", { data: { title: "B", count: 5 } });
			await createContent("scores", { data: { title: "C", count: 10 } });

			const token = await readerToken();

			const eqResponse = await fetchWorker(
				"/collections/scores/content?count=5",
				{},
				token,
			);
			expect(eqResponse.status).toBe(200);

			const eqBody = (await eqResponse.json()) as {
				data: Array<{ data: Record<string, unknown> }>;
			};
			expect(eqBody.data).toHaveLength(1);
			const first = eqBody.data[0]!;
			expect(first.data.title).toBe("B");

			const gtResponse = await fetchWorker(
				"/collections/scores/content?count[gt]=1",
				{},
				token,
			);
			expect(gtResponse.status).toBe(200);

			const gtBody = (await gtResponse.json()) as {
				data: Array<{ data: Record<string, unknown> }>;
			};
			expect(gtBody.data).toHaveLength(2);
			const titles = gtBody.data.map((item) => item.data.title);
			expect(titles).toContain("B");
			expect(titles).toContain("C");
		});

		it("rejects ordering operators on string fields", async () => {
			await createCollection({
				slug: "scores",
				name: "Scores",
				schema: makeCollectionSchema(),
			});

			const token = await readerToken();

			const response = await fetchWorker(
				"/collections/scores/content?title[gt]=A",
				{},
				token,
			);
			expect(response.status).toBe(400);

			const body = (await response.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_FAILED");
		});

		it("exposes only valid operators per field type in openapi.json", async () => {
			await createCollection({
				slug: "scores",
				name: "Scores",
				schema: makeCollectionSchema(),
			});

			const token = await readerToken();
			const response = await fetchWorker("/openapi.json", {}, token);
			expect(response.status).toBe(200);

			const spec = (await response.json()) as {
				paths: Record<
					string,
					{
						get?: {
							parameters?: Array<{ name: string }>;
						};
					}
				>;
			};
			const parameters =
				spec.paths["/collections/scores/content"]?.get?.parameters;
			expect(parameters).toBeDefined();

			const names = parameters!.map((param) => param.name);
			expect(names).toContain("title");
			expect(names).toContain("title[ne]");
			expect(names).not.toContain("title[gt]");
			expect(names).not.toContain("title[gte]");
			expect(names).not.toContain("title[lt]");
			expect(names).not.toContain("title[lte]");
			expect(names).toContain("count");
			expect(names).toContain("count[gt]");
			expect(names).toContain("count[gte]");
			expect(names).toContain("count[lt]");
			expect(names).toContain("count[lte]");
			expect(names).toContain("count[ne]");
			expect(names).toContain("title[in]");
			expect(names).toContain("count[in]");
			expect(names).toContain("title[nin]");
			expect(names).toContain("count[nin]");
		});

		it("filters string fields with ?field[in]=v1,v2", async () => {
			await createCollection({
				slug: "scores",
				name: "Scores",
				schema: makeCollectionSchema(),
			});

			await createContent("scores", { data: { title: "A", count: 1 } });
			await createContent("scores", { data: { title: "B", count: 5 } });
			await createContent("scores", { data: { title: "C", count: 10 } });

			const token = await readerToken();

			const response = await fetchWorker(
				"/collections/scores/content?title[in]=A,C",
				{},
				token,
			);
			expect(response.status).toBe(200);

			const body = (await response.json()) as {
				data: Array<{ data: Record<string, unknown> }>;
			};
			expect(body.data).toHaveLength(2);
			const titles = body.data.map((item) => item.data.title);
			expect(titles).toContain("A");
			expect(titles).toContain("C");
		});

		it("filters number fields with ?field[in]=v1,v2", async () => {
			await createCollection({
				slug: "scores",
				name: "Scores",
				schema: makeCollectionSchema(),
			});

			await createContent("scores", { data: { title: "A", count: 1 } });
			await createContent("scores", { data: { title: "B", count: 5 } });
			await createContent("scores", { data: { title: "C", count: 10 } });

			const token = await readerToken();

			const response = await fetchWorker(
				"/collections/scores/content?count[in]=1,10",
				{},
				token,
			);
			expect(response.status).toBe(200);

			const body = (await response.json()) as {
				data: Array<{ data: Record<string, unknown> }>;
			};
			expect(body.data).toHaveLength(2);
			const titles = body.data.map((item) => item.data.title);
			expect(titles).toContain("A");
			expect(titles).toContain("C");
		});
	});

	describe("GET /collections/:slug/content?resolve=", () => {
		it("resolves single and many relation fields on request", async () => {
			await createCollection({
				slug: "authors",
				name: "Authors",
				schema: {
					type: "object",
					properties: {
						name: { type: "string" },
					},
					required: ["name"],
					additionalProperties: false,
				},
			});

			await createCollection({
				slug: "tags",
				name: "Tags",
				schema: {
					type: "object",
					properties: {
						label: { type: "string" },
					},
					required: ["label"],
					additionalProperties: false,
				},
			});

			await createCollection({
				slug: "articles",
				name: "Articles",
				schema: {
					type: "object",
					properties: {
						title: { type: "string" },
						author: { type: "string", "x-relation": "authors" },
						tags: {
							type: "array",
							items: { type: "string" },
							"x-relation": "tags",
						},
					},
					required: ["title", "author"],
					additionalProperties: false,
				},
			});

			const author = await createContent("authors", {
				data: { name: "Ada Lovelace" },
			});

			const tagA = await createContent("tags", { data: { label: "code" } });
			const tagB = await createContent("tags", { data: { label: "history" } });

			const article = await createContent("articles", {
				data: {
					title: "First Note",
					author: author.id,
					tags: [tagA.id, tagB.id],
				},
			});

			const token = await readerToken();

			const unresolved = await fetchWorker(
				`/collections/articles/content/${article.id}`,
				{},
				token,
			);
			expect(unresolved.status).toBe(200);
			const unresolvedBody = (await unresolved.json()) as {
				data: Record<string, unknown>;
			};
			expect(unresolvedBody.data.author).toBe(author.id);
			expect(unresolvedBody.data.tags).toEqual([tagA.id, tagB.id]);

			const resolved = await fetchWorker(
				`/collections/articles/content/${article.id}?resolve=author,tags`,
				{},
				token,
			);
			expect(resolved.status).toBe(200);
			const resolvedBody = (await resolved.json()) as {
				data: Record<string, unknown>;
			};

			const resolvedAuthor = resolvedBody.data.author as {
				id: string;
				data: Record<string, unknown>;
			};
			expect(resolvedAuthor.id).toBe(author.id);
			expect(resolvedAuthor.data.name).toBe("Ada Lovelace");

			const resolvedTags = resolvedBody.data.tags as Array<{
				id: string;
				data: Record<string, unknown>;
			}>;
			expect(resolvedTags).toHaveLength(2);
			expect(resolvedTags.map((tag) => tag.data.label).sort()).toEqual([
				"code",
				"history",
			]);

			const listed = await fetchWorker(
				`/collections/articles/content?resolve=author`,
				{},
				token,
			);
			expect(listed.status).toBe(200);
			const listedBody = (await listed.json()) as {
				data: Array<{ data: Record<string, unknown> }>;
			};
			expect(listedBody.data).toHaveLength(1);
			const listedAuthor = listedBody.data[0]!.data.author as {
				id: string;
				data: Record<string, unknown>;
			};
			expect(listedAuthor.id).toBe(author.id);
			expect(listedAuthor.data.name).toBe("Ada Lovelace");
		});

		it("rejects resolving unknown or non-relation fields", async () => {
			await createCollection({
				slug: "items",
				name: "Items",
				schema: {
					type: "object",
					properties: {
						title: { type: "string" },
					},
					required: ["title"],
					additionalProperties: false,
				},
			});

			const item = await createContent("items", { data: { title: "Item" } });
			const token = await readerToken();

			const response = await fetchWorker(
				`/collections/items/content/${item.id}?resolve=title`,
				{},
				token,
			);
			expect(response.status).toBe(400);
			const body = (await response.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_FAILED");
		});
	});

	describe("DELETE /collections/:slug", () => {
		it("refuses when content exists unless force=true", async () => {
			await createCollection({
				slug: "notes",
				name: "Notes",
				schema: makeCollectionSchema(),
			});

			await createContent("notes", { data: { title: "Note", count: 1 } });

			const token = await adminToken();

			const withoutForce = await fetchWorker(
				"/collections/notes",
				{
					method: "DELETE",
				},
				token,
			);

			expect(withoutForce.status).toBe(409);

			const withoutForceBody = (await withoutForce.json()) as { code: string };
			expect(withoutForceBody.code).toBe("COLLECTION_DELETE_FAILED");

			const withForce = await fetchWorker(
				"/collections/notes?force=true",
				{
					method: "DELETE",
				},
				token,
			);

			expect(withForce.status).toBe(204);

			const row = await env.DB.prepare(
				"SELECT COUNT(*) as count FROM collections WHERE slug = ?",
			)
				.bind("notes")
				.first<{ count: number }>();
			expect(row!.count).toBe(0);
		});
	});

	describe("x-media fields", () => {
		const mediaCollectionSchema = {
			type: "object",
			properties: {
				title: { type: "string" },
				cover: { type: "object", "x-media": true },
			},
			required: ["title"],
			additionalProperties: false,
		};

		it("creates content with a valid media reference", async () => {
			await createCollection({
				slug: "articles",
				name: "Articles",
				schema: mediaCollectionSchema,
			});

			const file = new File(["cover"], "cover.png", { type: "image/png" });
			const media = await createMedia(file);

			const content = await createContent("articles", {
				data: { title: "Article", cover: { id: media.id, path: media.r2Key } },
			});

			expect(content.data.cover).toEqual({
				id: media.id,
				path: `${env.MEDIA_PUBLIC_URL}/${media.r2Key}`,
			});
		});

		it("rejects content with a missing media reference", async () => {
			await createCollection({
				slug: "articles",
				name: "Articles",
				schema: mediaCollectionSchema,
			});

			const token = await writerToken();
			const response = await fetchWorker(
				"/collections/articles/content",
				{
					method: "POST",
					body: JSON.stringify({
						data: {
							title: "Article",
							cover: { id: "med_00000000000000000000000000", path: "/missing" },
						},
					}),
				},
				token,
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as { code: string; message: string };
			expect(body.code).toBe("VALIDATION_FAILED");
			expect(body.message).toContain("Media not found");
		});

		it("rejects content with an invalid media object shape", async () => {
			await createCollection({
				slug: "articles",
				name: "Articles",
				schema: mediaCollectionSchema,
			});

			const token = await writerToken();
			const response = await fetchWorker(
				"/collections/articles/content",
				{
					method: "POST",
					body: JSON.stringify({
						data: { title: "Article", cover: { id: "med_abc123" } },
					}),
				},
				token,
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_FAILED");
		});

		it("resolves media fields when requested", async () => {
			await createCollection({
				slug: "articles",
				name: "Articles",
				schema: mediaCollectionSchema,
			});

			const file = new File(["cover"], "cover.png", { type: "image/png" });
			const media = await createMedia(file);

			const content = await createContent("articles", {
				data: { title: "Article", cover: { id: media.id, path: media.r2Key } },
			});

			const token = await readerToken();
			const unresolved = await fetchWorker(
				`/collections/articles/content/${content.id}`,
				{},
				token,
			);
			expect(unresolved.status).toBe(200);
			const unresolvedBody = (await unresolved.json()) as {
				data: Record<string, unknown>;
			};
			expect(unresolvedBody.data.cover).toEqual({
				id: media.id,
				path: `${env.MEDIA_PUBLIC_URL}/${media.r2Key}`,
			});

			const resolved = await fetchWorker(
				`/collections/articles/content/${content.id}?resolve=cover`,
				{},
				token,
			);
			expect(resolved.status).toBe(200);
			const resolvedBody = (await resolved.json()) as {
				data: Record<string, unknown>;
			};

			const resolvedCover = resolvedBody.data.cover as {
				id: string;
				url: string;
				filename: string;
				mimeType: string;
				sizeBytes: number;
			};
			expect(resolvedCover.id).toBe(media.id);
			expect(resolvedCover.url).toBe(`${env.MEDIA_PUBLIC_URL}/${media.r2Key}`);
			expect(resolvedCover.filename).toBe("cover.png");
			expect(resolvedCover.mimeType).toBe("image/png");
			expect(resolvedCover.sizeBytes).toBe(5);
		});

		it("supports an array of media references", async () => {
			await createCollection({
				slug: "galleries",
				name: "Galleries",
				schema: {
					type: "object",
					properties: {
						title: { type: "string" },
						images: {
							type: "array",
							items: { type: "object" },
							"x-media": true,
						},
					},
					required: ["title"],
					additionalProperties: false,
				},
			});

			const fileA = new File(["a"], "a.png", { type: "image/png" });
			const fileB = new File(["b"], "b.png", { type: "image/png" });
			const mediaA = await createMedia(fileA);
			const mediaB = await createMedia(fileB);

			const content = await createContent("galleries", {
				data: {
					title: "Gallery",
					images: [
						{ id: mediaA.id, path: mediaA.r2Key },
						{ id: mediaB.id, path: mediaB.r2Key },
					],
				},
			});

			expect(content.data.images).toEqual([
				{ id: mediaA.id, path: `${env.MEDIA_PUBLIC_URL}/${mediaA.r2Key}` },
				{ id: mediaB.id, path: `${env.MEDIA_PUBLIC_URL}/${mediaB.r2Key}` },
			]);

			const token = await readerToken();
			const resolved = await fetchWorker(
				`/collections/galleries/content/${content.id}?resolve=images`,
				{},
				token,
			);
			expect(resolved.status).toBe(200);
			const resolvedBody = (await resolved.json()) as {
				data: Record<string, unknown>;
			};

			const resolvedImages = resolvedBody.data.images as Array<{
				id: string;
				filename: string;
			}>;
			expect(resolvedImages).toHaveLength(2);
			expect(resolvedImages.map((image) => image.filename).sort()).toEqual([
				"a.png",
				"b.png",
			]);
		});

		it("validates media existence on /content:validate", async () => {
			await createCollection({
				slug: "articles",
				name: "Articles",
				schema: mediaCollectionSchema,
			});

			const token = await writerToken();
			const invalidResponse = await fetchWorker(
				"/collections/articles/content:validate",
				{
					method: "POST",
					body: JSON.stringify({
						data: {
							title: "Article",
							cover: { id: "med_00000000000000000000000000", path: "/missing" },
						},
					}),
				},
				token,
			);

			expect(invalidResponse.status).toBe(400);
			const invalidBody = (await invalidResponse.json()) as { code: string };
			expect(invalidBody.code).toBe("VALIDATION_FAILED");

			const file = new File(["cover"], "cover.png", { type: "image/png" });
			const media = await createMedia(file);

			const validResponse = await fetchWorker(
				"/collections/articles/content:validate",
				{
					method: "POST",
					body: JSON.stringify({
						data: {
							title: "Article",
							cover: { id: media.id, path: media.r2Key },
						},
					}),
				},
				token,
			);

			expect(validResponse.status).toBe(200);
			const validBody = (await validResponse.json()) as { valid: boolean };
			expect(validBody.valid).toBe(true);
		});
	});
});
