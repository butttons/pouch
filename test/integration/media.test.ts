import { describe, expect, it } from "vitest";

import {
	createCollection,
	createContent,
	createMedia,
	fetchWorker,
	readerToken,
	writerToken,
} from "../utils.js";
import { env } from "cloudflare:test";

describe("media", () => {
	describe("POST /media", () => {
		it("uploads a file and creates a media record", async () => {
			const file = new File(["hello world"], "test.txt", {
				type: "text/plain",
			});

			const body = await createMedia(file);

			expect(body.id).toMatch(/^med_/);
			expect(body.filename).toBe("test.txt");
			expect(body.mimeType).toBe("text/plain");
			expect(body.sizeBytes).toBe(11);
			expect(body.status).toBe("ready");
			expect(body.r2Key).toMatch(/^media\/[\w-]+\/test\.txt$/);
			expect(body.createdAt).toBeGreaterThan(0);
			expect(body.updatedAt).toBeGreaterThan(0);

			const row = await env.DB.prepare("SELECT * FROM media WHERE id = ?")
				.bind(body.id)
				.first<{
					r2_key: string;
					filename: string;
					mime_type: string;
					size_bytes: number;
					status: string;
				}>();

			expect(row).not.toBeNull();
			expect(row!.r2_key).toBe(body.r2Key);
			expect(row!.filename).toBe("test.txt");
			expect(row!.mime_type).toBe("text/plain");
			expect(row!.size_bytes).toBe(11);
			expect(row!.status).toBe("ready");
		});

		it("rejects requests without a file", async () => {
			const token = await writerToken();
			const formData = new FormData();
			formData.append("file", "not-a-file");

			const response = await fetchWorker(
				"/media",
				{
					method: "POST",
					body: formData,
				},
				token,
			);

			expect(response.status).toBe(400);
			const body = (await response.json()) as { code: string };
			expect(body.code).toBe("VALIDATION_FAILED");
		});
	});

	describe("GET /media", () => {
		it("lists uploaded media with cursor pagination", async () => {
			const file = new File(["list me"], "list.txt", { type: "text/plain" });
			const created = await createMedia(file);

			const readToken = await readerToken();
			const response = await fetchWorker("/media?limit=10", {}, readToken);

			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				data: Array<{ id: string }>;
				nextCursor: string | null;
			};

			expect(body.data.some((item) => item.id === created.id)).toBe(true);
			expect(body.nextCursor).toBeNull();
		});
	});

	describe("GET /media/:id", () => {
		it("returns media metadata", async () => {
			const file = new File(["metadata"], "meta.txt", { type: "text/plain" });
			const created = await createMedia(file);

			const readToken = await readerToken();
			const response = await fetchWorker(`/media/${created.id}`, {}, readToken);

			expect(response.status).toBe(200);
			const body = (await response.json()) as {
				id: string;
				filename: string;
			};

			expect(body.id).toBe(created.id);
			expect(body.filename).toBe("meta.txt");
		});

		it("returns 404 for unknown media", async () => {
			const readToken = await readerToken();
			const response = await fetchWorker(
				"/media/med_00000000000000000000000000",
				{},
				readToken,
			);

			expect(response.status).toBe(404);
		});
	});

	describe("GET /media/:id/file", () => {
		it("serves the uploaded file content", async () => {
			const file = new File(["file content"], "serve.txt", {
				type: "text/plain",
			});
			const created = await createMedia(file);

			const readToken = await readerToken();
			const response = await fetchWorker(
				`/media/${created.id}/file`,
				{},
				readToken,
			);

			expect(response.status).toBe(200);
			expect(response.headers.get("content-type")).toBe("text/plain");
			expect(await response.text()).toBe("file content");
		});
	});

	describe("DELETE /media/:id", () => {
		it("deletes the media record and the R2 object", async () => {
			const token = await writerToken();
			const file = new File(["delete me"], "delete.txt", {
				type: "text/plain",
			});
			const created = await createMedia(file);

			const deleteResponse = await fetchWorker(
				`/media/${created.id}`,
				{ method: "DELETE" },
				token,
			);

			expect(deleteResponse.status).toBe(204);

			const row = await env.DB.prepare("SELECT * FROM media WHERE id = ?")
				.bind(created.id)
				.first();
			expect(row).toBeNull();

			const object = await env.MEDIA_BUCKET.get(created.r2Key);
			expect(object).toBeNull();
		});

		it("refuses to delete media referenced by content", async () => {
			await createCollection({
				slug: "posts",
				name: "Posts",
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
			const file = new File(["cover"], "cover.png", { type: "image/png" });
			const media = await createMedia(file);

			await createContent("posts", {
				data: { title: "Post", cover: { id: media.id, path: media.r2Key } },
			});

			const deleteResponse = await fetchWorker(
				`/media/${media.id}`,
				{ method: "DELETE" },
				token,
			);

			expect(deleteResponse.status).toBe(409);
			const body = (await deleteResponse.json()) as { code: string };
			expect(body.code).toBe("MEDIA_IN_USE");

			const row = await env.DB.prepare("SELECT * FROM media WHERE id = ?")
				.bind(media.id)
				.first();
			expect(row).not.toBeNull();

			const object = await env.MEDIA_BUCKET.get(media.r2Key);
			expect(object).not.toBeNull();
		});
	});
});
