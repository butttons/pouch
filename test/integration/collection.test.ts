import { describe, expect, it } from "vitest";

import { adminToken, createCollection, fetchWorker } from "../utils.js";
import { env } from "cloudflare:test";

describe("collections", () => {
	describe("POST /collections", () => {
		it("creates a collection, a schema version, and sets currentSchemaVersionId", async () => {
			const schema = {
				type: "object",
				properties: {
					title: { type: "string" },
				},
				required: ["title"],
				additionalProperties: false,
			};

			const body = await createCollection({
				slug: "products",
				name: "Products",
				schema,
			});

			expect(body.slug).toBe("products");
			expect(body.name).toBe("Products");
			expect(body.titleField).toBeNull();
			expect(body.currentSchemaVersionId).toMatch(/^sch_/);
			expect(body.schema).toEqual(schema);

			const version = await env.DB.prepare(
				"SELECT * FROM schema_versions WHERE collection_id = ?",
			)
				.bind(body.id)
				.first<{ id: string; schema: string }>();

			expect(version).not.toBeNull();
			expect(version!.id).toBe(body.currentSchemaVersionId);
			expect(JSON.parse(version!.schema)).toEqual(schema);
		});
	});

	describe("PATCH /collections/:slug/schema", () => {
		it("allows safe additive changes without force", async () => {
			const collection = await createCollection({
				slug: "articles",
				name: "Articles",
				schema: {
					type: "object",
					properties: {
						title: { type: "string" },
					},
					required: ["title"],
					additionalProperties: false,
				},
			});

			const token = await adminToken();
			const response = await fetchWorker(
				"/collections/articles/schema",
				{
					method: "PATCH",
					body: JSON.stringify({
						schema: {
							type: "object",
							properties: {
								title: { type: "string" },
								description: { type: "string" },
							},
							required: ["title"],
							additionalProperties: false,
						},
					}),
				},
				token,
			);

			expect(response.status).toBe(200);

			const body = (await response.json()) as {
				currentSchemaVersionId: string;
				schema: Record<string, unknown>;
			};

			expect(body.currentSchemaVersionId).not.toBe(
				collection.currentSchemaVersionId,
			);
			expect(body.schema.properties).toHaveProperty("description");
		});

		it("blocks destructive changes unless force=true", async () => {
			await createCollection({
				slug: "pages",
				name: "Pages",
				schema: {
					type: "object",
					properties: {
						title: { type: "string" },
					},
					required: ["title"],
					additionalProperties: false,
				},
			});

			const token = await adminToken();
			const response = await fetchWorker(
				"/collections/pages/schema",
				{
					method: "PATCH",
					body: JSON.stringify({
						schema: {
							type: "object",
							properties: {
								title: { type: "number" },
							},
							required: ["title"],
							additionalProperties: false,
						},
					}),
				},
				token,
			);

			expect(response.status).toBe(409);

			const body = (await response.json()) as { code: string };
			expect(body.code).toBe("COLLECTION_SCHEMA_FORCE_REQUIRED");
		});

		it("inserts a new schema version and updates currentSchemaVersionId", async () => {
			const collection = await createCollection({
				slug: "events",
				name: "Events",
				schema: {
					type: "object",
					properties: {
						title: { type: "string" },
					},
					required: ["title"],
					additionalProperties: false,
				},
			});

			const beforeCount = await env.DB.prepare(
				"SELECT COUNT(*) as count FROM schema_versions WHERE collection_id = ?",
			)
				.bind(collection.id)
				.first<{ count: number }>();

			const token = await adminToken();
			const response = await fetchWorker(
				"/collections/events/schema",
				{
					method: "PATCH",
					body: JSON.stringify({
						schema: {
							type: "object",
							properties: {
								title: { type: "string" },
								xlabel: { type: "string", "x-label": "Label" },
							},
							required: ["title"],
							additionalProperties: false,
						},
					}),
				},
				token,
			);

			expect(response.status).toBe(200);

			const body = (await response.json()) as {
				currentSchemaVersionId: string;
			};

			const afterCount = await env.DB.prepare(
				"SELECT COUNT(*) as count FROM schema_versions WHERE collection_id = ?",
			)
				.bind(collection.id)
				.first<{ count: number }>();

			expect(afterCount!.count).toBe((beforeCount?.count ?? 0) + 1);
			expect(body.currentSchemaVersionId).not.toBe(
				collection.currentSchemaVersionId,
			);
		});
	});
});
