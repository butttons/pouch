import { describe, expect, it } from "vitest";

import {
  createCollection,
  createContent,
  fetchWorker,
  readerToken,
} from "../utils.js";

const titles = (body: { data: Array<{ data: Record<string, unknown> }> }) =>
  body.data.map((item) => item.data.title as string);

const ids = (body: { data: Array<{ id: string }> }) =>
  body.data.map((item) => item.id);

describe("filtering", () => {
  describe("string fields", () => {
    const makeSchema = () => ({
      type: "object",
      properties: {
        title: { type: "string" },
      },
      required: ["title"],
      additionalProperties: false,
    });

    it("filters with ?field=value (eq)", async () => {
      await createCollection({
        slug: "filter-string-eq",
        name: "Filter String Eq",
        schema: makeSchema(),
      });

      await createContent("filter-string-eq", { data: { title: "A" } });
      await createContent("filter-string-eq", { data: { title: "B" } });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-string-eq/content?title=A",
        {},
        token,
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(body)).toEqual(["A"]);
    });

    it("filters with ?field[ne]=value", async () => {
      await createCollection({
        slug: "filter-string-ne",
        name: "Filter String Ne",
        schema: makeSchema(),
      });

      await createContent("filter-string-ne", { data: { title: "A" } });
      await createContent("filter-string-ne", { data: { title: "B" } });
      await createContent("filter-string-ne", { data: { title: "C" } });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-string-ne/content?title[ne]=B",
        {},
        token,
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(body)).toContain("A");
      expect(titles(body)).toContain("C");
      expect(titles(body)).not.toContain("B");
    });

    it("filters with ?field[in]=v1,v2", async () => {
      await createCollection({
        slug: "filter-string-in",
        name: "Filter String In",
        schema: makeSchema(),
      });

      await createContent("filter-string-in", { data: { title: "A" } });
      await createContent("filter-string-in", { data: { title: "B" } });
      await createContent("filter-string-in", { data: { title: "C" } });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-string-in/content?title[in]=A,C",
        {},
        token,
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(body)).toEqual(expect.arrayContaining(["A", "C"]));
      expect(body.data).toHaveLength(2);
    });

    it("filters with ?field[nin]=v1,v2", async () => {
      await createCollection({
        slug: "filter-string-nin",
        name: "Filter String Nin",
        schema: makeSchema(),
      });

      await createContent("filter-string-nin", { data: { title: "A" } });
      await createContent("filter-string-nin", { data: { title: "B" } });
      await createContent("filter-string-nin", { data: { title: "C" } });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-string-nin/content?title[nin]=A,C",
        {},
        token,
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(body)).toEqual(["B"]);
    });
  });

  describe("number fields", () => {
    const makeSchema = () => ({
      type: "object",
      properties: {
        title: { type: "string" },
        count: { type: "integer" },
      },
      required: ["title", "count"],
      additionalProperties: false,
    });

    it("filters with ordering operators", async () => {
      await createCollection({
        slug: "filter-number-order",
        name: "Filter Number Order",
        schema: makeSchema(),
      });

      await createContent("filter-number-order", {
        data: { title: "A", count: 1 },
      });
      await createContent("filter-number-order", {
        data: { title: "B", count: 5 },
      });
      await createContent("filter-number-order", {
        data: { title: "C", count: 10 },
      });

      const token = await readerToken();

      const gtResponse = await fetchWorker(
        "/collections/filter-number-order/content?count[gt]=1",
        {},
        token,
      );
      expect(gtResponse.status).toBe(200);
      const gtBody = (await gtResponse.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(gtBody)).toContain("B");
      expect(titles(gtBody)).toContain("C");

      const gteResponse = await fetchWorker(
        "/collections/filter-number-order/content?count[gte]=5",
        {},
        token,
      );
      expect(gteResponse.status).toBe(200);
      const gteBody = (await gteResponse.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(gteBody)).toContain("B");
      expect(titles(gteBody)).toContain("C");

      const ltResponse = await fetchWorker(
        "/collections/filter-number-order/content?count[lt]=10",
        {},
        token,
      );
      expect(ltResponse.status).toBe(200);
      const ltBody = (await ltResponse.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(ltBody)).toContain("A");
      expect(titles(ltBody)).toContain("B");

      const lteResponse = await fetchWorker(
        "/collections/filter-number-order/content?count[lte]=5",
        {},
        token,
      );
      expect(lteResponse.status).toBe(200);
      const lteBody = (await lteResponse.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(lteBody)).toContain("A");
      expect(titles(lteBody)).toContain("B");
    });

    it("filters with ?field[in]=v1,v2", async () => {
      await createCollection({
        slug: "filter-number-in",
        name: "Filter Number In",
        schema: makeSchema(),
      });

      await createContent("filter-number-in", {
        data: { title: "A", count: 1 },
      });
      await createContent("filter-number-in", {
        data: { title: "B", count: 5 },
      });
      await createContent("filter-number-in", {
        data: { title: "C", count: 10 },
      });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-number-in/content?count[in]=1,10",
        {},
        token,
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(body)).toEqual(expect.arrayContaining(["A", "C"]));
      expect(body.data).toHaveLength(2);
    });

    it("filters with ?field[nin]=v1,v2", async () => {
      await createCollection({
        slug: "filter-number-nin",
        name: "Filter Number Nin",
        schema: makeSchema(),
      });

      await createContent("filter-number-nin", {
        data: { title: "A", count: 1 },
      });
      await createContent("filter-number-nin", {
        data: { title: "B", count: 5 },
      });
      await createContent("filter-number-nin", {
        data: { title: "C", count: 10 },
      });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-number-nin/content?count[nin]=1,10",
        {},
        token,
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(body)).toEqual(["B"]);
    });

    it("filters with a range ?field[gt]=n&field[lt]=n", async () => {
      await createCollection({
        slug: "filter-number-range",
        name: "Filter Number Range",
        schema: makeSchema(),
      });

      await createContent("filter-number-range", {
        data: { title: "A", count: 5 },
      });
      await createContent("filter-number-range", {
        data: { title: "B", count: 10 },
      });
      await createContent("filter-number-range", {
        data: { title: "C", count: 15 },
      });
      await createContent("filter-number-range", {
        data: { title: "D", count: 20 },
      });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-number-range/content?count[gt]=5&count[lt]=20",
        {},
        token,
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(body)).toEqual(expect.arrayContaining(["B", "C"]));
      expect(body.data).toHaveLength(2);
    });
  });

  describe("boolean fields", () => {
    const makeSchema = () => ({
      type: "object",
      properties: {
        title: { type: "string" },
        isActive: { type: "boolean" },
      },
      required: ["title", "isActive"],
      additionalProperties: false,
    });

    it("filters with ?field[eq]=true", async () => {
      await createCollection({
        slug: "filter-bool-eq",
        name: "Filter Bool Eq",
        schema: makeSchema(),
      });

      await createContent("filter-bool-eq", {
        data: { title: "A", isActive: true },
      });
      await createContent("filter-bool-eq", {
        data: { title: "B", isActive: false },
      });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-bool-eq/content?isActive=true",
        {},
        token,
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(body)).toEqual(["A"]);
    });

    it("filters with ?field[in]=true", async () => {
      await createCollection({
        slug: "filter-bool-in",
        name: "Filter Bool In",
        schema: makeSchema(),
      });

      await createContent("filter-bool-in", {
        data: { title: "A", isActive: true },
      });
      await createContent("filter-bool-in", {
        data: { title: "B", isActive: false },
      });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-bool-in/content?isActive[in]=true",
        {},
        token,
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(body)).toEqual(["A"]);
    });

    it("filters with ?field[nin]=true", async () => {
      await createCollection({
        slug: "filter-bool-nin",
        name: "Filter Bool Nin",
        schema: makeSchema(),
      });

      await createContent("filter-bool-nin", {
        data: { title: "A", isActive: true },
      });
      await createContent("filter-bool-nin", {
        data: { title: "B", isActive: false },
      });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-bool-nin/content?isActive[nin]=true",
        {},
        token,
      );
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(body)).toEqual(["B"]);
    });
  });

  describe("date fields", () => {
    const makeSchema = () => ({
      type: "object",
      properties: {
        title: { type: "string" },
        publishedAt: { type: "string", format: "date" },
      },
      required: ["title", "publishedAt"],
      additionalProperties: false,
    });

    it("filters with ordering and set operators", async () => {
      await createCollection({
        slug: "filter-date",
        name: "Filter Date",
        schema: makeSchema(),
      });

      await createContent("filter-date", {
        data: { title: "A", publishedAt: "2024-01-01" },
      });
      await createContent("filter-date", {
        data: { title: "B", publishedAt: "2024-06-15" },
      });
      await createContent("filter-date", {
        data: { title: "C", publishedAt: "2024-12-31" },
      });

      const token = await readerToken();

      const gtResponse = await fetchWorker(
        "/collections/filter-date/content?publishedAt[gt]=2024-01-01",
        {},
        token,
      );
      expect(gtResponse.status).toBe(200);
      const gtBody = (await gtResponse.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(gtBody)).toContain("B");
      expect(titles(gtBody)).toContain("C");

      const inResponse = await fetchWorker(
        "/collections/filter-date/content?publishedAt[in]=2024-01-01,2024-12-31",
        {},
        token,
      );
      expect(inResponse.status).toBe(200);
      const inBody = (await inResponse.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(inBody)).toEqual(expect.arrayContaining(["A", "C"]));
      expect(inBody.data).toHaveLength(2);

      const ninResponse = await fetchWorker(
        "/collections/filter-date/content?publishedAt[nin]=2024-01-01,2024-12-31",
        {},
        token,
      );
      expect(ninResponse.status).toBe(200);
      const ninBody = (await ninResponse.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(ninBody)).toEqual(["B"]);
    });
  });

  describe("indexed fields", () => {
    const makeSchema = () => ({
      type: "object",
      properties: {
        title: { type: "string" },
        score: { type: "integer", "x-index": true },
        category: { type: "string", "x-index": true },
      },
      required: ["title", "score", "category"],
      additionalProperties: false,
    });

    it("filters indexed number and string fields with eq", async () => {
      await createCollection({
        slug: "filter-indexed-eq",
        name: "Filter Indexed Eq",
        schema: makeSchema(),
      });

      await createContent("filter-indexed-eq", {
        data: { title: "A", score: 10, category: "x" },
      });
      await createContent("filter-indexed-eq", {
        data: { title: "B", score: 20, category: "y" },
      });

      const token = await readerToken();

      const scoreResponse = await fetchWorker(
        "/collections/filter-indexed-eq/content?score=10",
        {},
        token,
      );
      expect(scoreResponse.status).toBe(200);
      const scoreBody = (await scoreResponse.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(scoreBody)).toEqual(["A"]);

      const categoryResponse = await fetchWorker(
        "/collections/filter-indexed-eq/content?category=x",
        {},
        token,
      );
      expect(categoryResponse.status).toBe(200);
      const categoryBody = (await categoryResponse.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(categoryBody)).toEqual(["A"]);
    });

    it("filters indexed fields with in and nin", async () => {
      await createCollection({
        slug: "filter-indexed-set",
        name: "Filter Indexed Set",
        schema: makeSchema(),
      });

      await createContent("filter-indexed-set", {
        data: { title: "A", score: 10, category: "x" },
      });
      await createContent("filter-indexed-set", {
        data: { title: "B", score: 20, category: "y" },
      });
      await createContent("filter-indexed-set", {
        data: { title: "C", score: 30, category: "z" },
      });

      const token = await readerToken();

      const inResponse = await fetchWorker(
        "/collections/filter-indexed-set/content?category[in]=x,z",
        {},
        token,
      );
      expect(inResponse.status).toBe(200);
      const inBody = (await inResponse.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(inBody)).toEqual(expect.arrayContaining(["A", "C"]));
      expect(inBody.data).toHaveLength(2);

      const ninResponse = await fetchWorker(
        "/collections/filter-indexed-set/content?score[nin]=10,30",
        {},
        token,
      );
      expect(ninResponse.status).toBe(200);
      const ninBody = (await ninResponse.json()) as {
        data: Array<{ data: Record<string, unknown> }>;
      };
      expect(titles(ninBody)).toEqual(["B"]);
    });
  });

  describe("validation", () => {
    const makeSchema = () => ({
      type: "object",
      properties: {
        title: { type: "string" },
        count: { type: "integer" },
      },
      required: ["title", "count"],
      additionalProperties: false,
    });

    it("rejects invalid operators for field types", async () => {
      await createCollection({
        slug: "filter-validation-op",
        name: "Filter Validation Op",
        schema: makeSchema(),
      });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-validation-op/content?title[gt]=A",
        {},
        token,
      );
      expect(response.status).toBe(400);

      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("VALIDATION_FAILED");
    });

    it("rejects empty in values", async () => {
      await createCollection({
        slug: "filter-validation-empty-in",
        name: "Filter Validation Empty In",
        schema: makeSchema(),
      });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-validation-empty-in/content?title[in]=",
        {},
        token,
      );
      expect(response.status).toBe(400);

      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("VALIDATION_FAILED");
    });

    it("rejects empty nin values", async () => {
      await createCollection({
        slug: "filter-validation-empty-nin",
        name: "Filter Validation Empty Nin",
        schema: makeSchema(),
      });

      const token = await readerToken();
      const response = await fetchWorker(
        "/collections/filter-validation-empty-nin/content?title[nin]=",
        {},
        token,
      );
      expect(response.status).toBe(400);

      const body = (await response.json()) as { code: string };
      expect(body.code).toBe("VALIDATION_FAILED");
    });
  });
});
