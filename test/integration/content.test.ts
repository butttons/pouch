import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  adminToken,
  createCollection,
  createContent,
  fetchWorker,
  readerToken,
  writerToken,
} from "../utils.js";

const makeCollectionSchema = (extraProperties: Record<string, unknown> = {}) => ({
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

      const eqBody = (await eqResponse.json()) as Array<{ data: Record<string, unknown> }>;
      expect(eqBody).toHaveLength(1);
      const first = eqBody[0]!;
      expect(first.data.title).toBe("B");

      const gtResponse = await fetchWorker(
        "/collections/scores/content?count[gt]=1",
        {},
        token,
      );
      expect(gtResponse.status).toBe(200);

      const gtBody = (await gtResponse.json()) as Array<{ data: Record<string, unknown> }>;
      expect(gtBody).toHaveLength(2);
      const titles = gtBody.map((item) => item.data.title);
      expect(titles).toContain("B");
      expect(titles).toContain("C");
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
});
