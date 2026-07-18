import { describe, expect, it } from "vitest";

import {
	createCollection,
	createContent,
	createMedia,
	fetchWorker,
	readerToken,
} from "../utils.js";

/**
 * A small product catalog with brands, categories, products, and reviews.
 *
 * Demonstrates:
 * - Single relations (product -> brand, product -> category)
 * - Reverse relations via reviews (review -> product)
 * - Media fields (product image)
 * - Filtering by number and boolean fields
 */

describe("example: product catalog", () => {
	it("creates a catalog and queries products", async () => {
		const brandSchema = {
			type: "object",
			properties: {
				name: { type: "string" },
			},
			required: ["name"],
			additionalProperties: false,
		};

		const categorySchema = {
			type: "object",
			properties: {
				label: { type: "string" },
			},
			required: ["label"],
			additionalProperties: false,
		};

		const productSchema = {
			type: "object",
			properties: {
				name: { type: "string" },
				price: { type: "number", "x-index": true },
				inStock: { type: "boolean", "x-index": true },
				brand: { type: "string", "x-relation": "brands" },
				category: { type: "string", "x-relation": "categories" },
				image: { type: "object", "x-media": true },
			},
			required: ["name", "price", "brand", "category"],
			additionalProperties: false,
		};

		const reviewSchema = {
			type: "object",
			properties: {
				rating: { type: "number" },
				comment: { type: "string" },
				product: { type: "string", "x-relation": "products" },
			},
			required: ["rating", "product"],
			additionalProperties: false,
		};

		await createCollection({
			slug: "brands",
			name: "Brands",
			schema: brandSchema,
		});
		await createCollection({
			slug: "categories",
			name: "Categories",
			schema: categorySchema,
		});
		await createCollection({
			slug: "products",
			name: "Products",
			schema: productSchema,
		});
		await createCollection({
			slug: "reviews",
			name: "Reviews",
			schema: reviewSchema,
		});

		const acme = await createContent("brands", { data: { name: "Acme" } });
		const gadgets = await createContent("categories", {
			data: { label: "Gadgets" },
		});

		const file = new File(["product"], "widget.png", { type: "image/png" });
		const image = await createMedia(file);

		const widget = await createContent("products", {
			data: {
				name: "Widget",
				price: 19.99,
				inStock: true,
				brand: acme.id,
				category: gadgets.id,
				image: { id: image.id, path: image.r2Key },
			},
		});

		await createContent("reviews", {
			data: {
				rating: 5,
				comment: "Great widget!",
				product: widget.id,
			},
		});

		const token = await readerToken();

		// Filter products by price range
		const cheapResponse = await fetchWorker(
			"/collections/products/content?price[lte]=50&inStock=true",
			{},
			token,
		);
		expect(cheapResponse.status).toBe(200);
		const cheapBody = (await cheapResponse.json()) as {
			data: Array<{ data: Record<string, unknown> }>;
		};
		expect(cheapBody.data).toHaveLength(1);
		expect(cheapBody.data[0]!.data.name).toBe("Widget");

		// Resolve brand, category, and image
		const resolved = await fetchWorker(
			`/collections/products/content/${widget.id}?resolve=brand,category,image`,
			{},
			token,
		);
		expect(resolved.status).toBe(200);
		const resolvedBody = (await resolved.json()) as {
			data: Record<string, unknown>;
		};

		const resolvedBrand = resolvedBody.data.brand as {
			id: string;
			data: Record<string, unknown>;
		};
		expect(resolvedBrand.data.name).toBe("Acme");

		const resolvedCategory = resolvedBody.data.category as {
			id: string;
			data: Record<string, unknown>;
		};
		expect(resolvedCategory.data.label).toBe("Gadgets");

		const resolvedImage = resolvedBody.data.image as {
			id: string;
			filename: string;
		};
		expect(resolvedImage.filename).toBe("widget.png");
	});
});
