import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { computeIndexColumnName, computeIndexName } from "@/lib/content-index.js";
import {
  adminToken,
  createCollection,
  createContent,
  fetchWorker,
  readerToken,
  writerToken,
} from "../utils.js";

const LONG_FIELD_KEY = "a".repeat(50);

const getIndexColumn = (input: { collectionId: string; field: string }) =>
  computeIndexColumnName(input);

const getIndexName = (input: { collectionId: string; field: string }) =>
  computeIndexName(input);

const indexedSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    score: { type: "number", "x-index": true },
    published: { type: "boolean", "x-index": true },
  },
  required: ["title", "score"],
  additionalProperties: false,
};

describe("x-index", () => {
  describe("schema validation", () => {
    it("rejects x-index on array fields", async () => {
      const token = await adminToken();
      const response = await fetchWorker(
        "/collections",
        {
          method: "POST",
          body: JSON.stringify({
            slug: "invalid-array-index",
            name: "Invalid",
            schema: {
              type: "object",
              properties: {
                tags: {
                  type: "array",
                  items: { type: "string" },
                  "x-index": true,
                },
              },
              required: ["tags"],
              additionalProperties: false,
            },
          }),
        },
        token,
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("COLLECTION_SCHEMA_INVALID");
    });

    it("rejects x-index on fields with keys too long for SQLite identifiers", async () => {
      const token = await adminToken();
      const response = await fetchWorker(
        "/collections",
        {
          method: "POST",
          body: JSON.stringify({
            slug: "invalid-long-key",
            name: "Invalid",
            schema: {
              type: "object",
              properties: {
                [LONG_FIELD_KEY]: { type: "string", "x-index": true },
              },
              required: [LONG_FIELD_KEY],
              additionalProperties: false,
            },
          }),
        },
        token,
      );

      expect(response.status).toBe(400);
      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("COLLECTION_SCHEMA_INVALID");
    });
  });

  describe("collection creation", () => {
    it("creates generated columns and indexes for x-index fields", async () => {
      const collection = await createCollection({
        slug: "indexed-posts",
        name: "Indexed Posts",
        schema: indexedSchema,
      });

      const columnName = getIndexColumn({
        collectionId: collection.id,
        field: "score",
      });
      const indexName = getIndexName({
        collectionId: collection.id,
        field: "score",
      });

      const tableInfo = await env.DB.prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'content'`,
      ).first<{ sql: string }>();
      expect(tableInfo?.sql).toContain(columnName);

      const indexes = await env.DB.prepare(
        `PRAGMA index_list(content)`,
      ).all<{ name: string }>();
      const indexNames = indexes.results?.map((row) => row.name) ?? [];
      expect(indexNames).toContain(indexName);
    });
  });

  describe("content filtering", () => {
    it("uses the generated column index for equality filters", async () => {
      const collection = await createCollection({
        slug: "filtered-scores",
        name: "Filtered Scores",
        schema: indexedSchema,
      });

      await createContent("filtered-scores", {
        data: { title: "Low", score: 10, published: true },
      });
      await createContent("filtered-scores", {
        data: { title: "High", score: 90, published: false },
      });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filtered-scores/content?score=90",
        {},
        token,
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(body.data).toHaveLength(1);
      expect(body.data[0]!.data.title).toBe("High");

      const columnName = getIndexColumn({
        collectionId: collection.id,
        field: "score",
      });
      const plan = await env.DB.prepare(
        `EXPLAIN QUERY PLAN SELECT * FROM content WHERE ${columnName} = 90`,
      ).all<{ detail: string }>();
      const details = plan.results?.map((row) => row.detail.toLowerCase()) ?? [];
      expect(details.some((detail) => detail.includes("using index"))).toBe(true);
    });

    it("uses the generated column for comparison filters", async () => {
      const collection = await createCollection({
        slug: "compared-scores",
        name: "Compared Scores",
        schema: indexedSchema,
      });

      await createContent("compared-scores", {
        data: { title: "A", score: 10, published: true },
      });
      await createContent("compared-scores", {
        data: { title: "B", score: 50, published: true },
      });
      await createContent("compared-scores", {
        data: { title: "C", score: 90, published: false },
      });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/compared-scores/content?score[gt]=20",
        {},
        token,
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(body.data).toHaveLength(2);
      const titles = body.data.map((item) => item.data.title);
      expect(titles).toContain("B");
      expect(titles).toContain("C");

      const columnName = getIndexColumn({
        collectionId: collection.id,
        field: "score",
      });
      const plan = await env.DB.prepare(
        `EXPLAIN QUERY PLAN SELECT * FROM content WHERE ${columnName} > 20`,
      ).all<{ detail: string }>();
      const details = plan.results?.map((row) => row.detail.toLowerCase()) ?? [];
      expect(details.some((detail) => detail.includes("using index"))).toBe(true);
    });
  });

  describe("schema patch lifecycle", () => {
    it("adds a generated column and index when x-index is added to an existing field", async () => {
      const collection = await createCollection({
        slug: "patch-add-index",
        name: "Patch Add Index",
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            score: { type: "number" },
          },
          required: ["title", "score"],
          additionalProperties: false,
        },
      });

      const token = await adminToken();
      const patchResponse = await fetchWorker(
        "/collections/patch-add-index/schema",
        {
          method: "PATCH",
          body: JSON.stringify({
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                score: { type: "number", "x-index": true },
              },
              required: ["title", "score"],
              additionalProperties: false,
            },
          }),
        },
        token,
      );

      expect(patchResponse.status).toBe(200);

      const columnName = getIndexColumn({
        collectionId: collection.id,
        field: "score",
      });
      const indexName = getIndexName({
        collectionId: collection.id,
        field: "score",
      });

      const tableInfo = await env.DB.prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'content'`,
      ).first<{ sql: string }>();
      expect(tableInfo?.sql).toContain(columnName);

      const indexes = await env.DB.prepare(
        `PRAGMA index_list(content)`,
      ).all<{ name: string }>();
      const indexNames = indexes.results?.map((row) => row.name) ?? [];
      expect(indexNames).toContain(indexName);
    });

    it("drops a generated column and index when an indexed field is removed", async () => {
      const collection = await createCollection({
        slug: "patch-remove-index",
        name: "Patch Remove Index",
        schema: indexedSchema,
      });

      const columnName = getIndexColumn({
        collectionId: collection.id,
        field: "score",
      });
      const indexName = getIndexName({
        collectionId: collection.id,
        field: "score",
      });

      const token = await adminToken();
      const patchResponse = await fetchWorker(
        "/collections/patch-remove-index/schema",
        {
          method: "PATCH",
          body: JSON.stringify({
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                published: { type: "boolean", "x-index": true },
              },
              required: ["title"],
              additionalProperties: false,
            },
            force: true,
          }),
        },
        token,
      );

      expect(patchResponse.status).toBe(200);

      const tableInfo = await env.DB.prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'content'`,
      ).first<{ sql: string }>();
      expect(tableInfo?.sql).not.toContain(columnName);

      const indexes = await env.DB.prepare(
        `PRAGMA index_list(content)`,
      ).all<{ name: string }>();
      const indexNames = indexes.results?.map((row) => row.name) ?? [];
      expect(indexNames).not.toContain(indexName);
    });

    it("recreates an index when an indexed field changes type", async () => {
      const collection = await createCollection({
        slug: "patch-change-index-type",
        name: "Patch Change Index Type",
        schema: {
          type: "object",
          properties: {
            title: { type: "string" },
            score: { type: "number", "x-index": true },
          },
          required: ["title", "score"],
          additionalProperties: false,
        },
      });

      const oldColumnName = getIndexColumn({
        collectionId: collection.id,
        field: "score",
      });

      const token = await adminToken();
      const patchResponse = await fetchWorker(
        "/collections/patch-change-index-type/schema",
        {
          method: "PATCH",
          body: JSON.stringify({
            schema: {
              type: "object",
              properties: {
                title: { type: "string" },
                score: { type: "string", "x-index": true },
              },
              required: ["title", "score"],
              additionalProperties: false,
            },
            force: true,
          }),
        },
        token,
      );

      expect(patchResponse.status).toBe(200);

      const tableInfo = await env.DB.prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'content'`,
      ).first<{ sql: string }>();
      const columnRegex = new RegExp(
        `"${oldColumnName}" TEXT\\s+GENERATED ALWAYS AS`,
        "i",
      );
      expect(tableInfo?.sql).toMatch(columnRegex);
    });
  });

  describe("collection deletion", () => {
    it("drops generated columns and indexes when the collection is deleted with force", async () => {
      const collection = await createCollection({
        slug: "delete-indexed",
        name: "Delete Indexed",
        schema: indexedSchema,
      });

      await createContent("delete-indexed", {
        data: { title: "Item", score: 5, published: true },
      });

      const columnName = getIndexColumn({
        collectionId: collection.id,
        field: "score",
      });
      const indexName = getIndexName({
        collectionId: collection.id,
        field: "score",
      });

      const token = await adminToken();
      const deleteResponse = await fetchWorker(
        "/collections/delete-indexed?force=true",
        {
          method: "DELETE",
        },
        token,
      );

      expect(deleteResponse.status).toBe(204);

      const tableInfo = await env.DB.prepare(
        `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'content'`,
      ).first<{ sql: string }>();
      expect(tableInfo?.sql).not.toContain(columnName);

      const indexes = await env.DB.prepare(
        `PRAGMA index_list(content)`,
      ).all<{ name: string }>();
      const indexNames = indexes.results?.map((row) => row.name) ?? [];
      expect(indexNames).not.toContain(indexName);

      const activeIndexRows = await env.DB.prepare(
        `SELECT COUNT(*) as count FROM content_indexes WHERE collection_id = ? AND deleted_at IS NULL`,
      )
        .bind(collection.id)
        .first<{ count: number }>();
      expect(activeIndexRows!.count).toBe(0);
    });
  });
});
