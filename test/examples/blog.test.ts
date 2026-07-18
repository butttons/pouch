import { describe, expect, it } from "vitest";

import {
	createCollection,
	createContent,
	createMedia,
	fetchWorker,
	readerToken,
} from "../utils.js";

/**
 * A blog with authors, categories, tags, and posts.
 *
 * Demonstrates:
 * - Single relations (post -> author)
 * - Many relations (post -> tags, post -> category)
 * - Media fields (featured image)
 * - Filtering and resolving relations
 */

describe("example: blog", () => {
	it("creates a blog and queries it", async () => {
		const authorSchema = {
			type: "object",
			properties: {
				name: { type: "string" },
				bio: { type: "string" },
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

		const tagSchema = {
			type: "object",
			properties: {
				label: { type: "string" },
			},
			required: ["label"],
			additionalProperties: false,
		};

		const postSchema = {
			type: "object",
			properties: {
				title: { type: "string" },
				slug: { type: "string" },
				body: { type: "string", "x-widget": "richtext" },
				published: { type: "boolean" },
				author: { type: "string", "x-relation": "authors" },
				category: { type: "string", "x-relation": "categories" },
				tags: {
					type: "array",
					items: { type: "string" },
					"x-relation": "tags",
				},
				featuredImage: { type: "object", "x-media": true },
			},
			required: ["title", "slug", "author", "category"],
			additionalProperties: false,
		};

		await createCollection({
			slug: "authors",
			name: "Authors",
			schema: authorSchema,
		});
		await createCollection({
			slug: "categories",
			name: "Categories",
			schema: categorySchema,
		});
		await createCollection({
			slug: "tags",
			name: "Tags",
			schema: tagSchema,
		});
		await createCollection({
			slug: "posts",
			name: "Posts",
			schema: postSchema,
		});

		const ada = await createContent("authors", {
			data: { name: "Ada Lovelace", bio: "Mathematician and writer" },
		});
		const tech = await createContent("categories", {
			data: { label: "Technology" },
		});
		const history = await createContent("categories", {
			data: { label: "History" },
		});
		const codeTag = await createContent("tags", { data: { label: "code" } });
		const historyTag = await createContent("tags", {
			data: { label: "history" },
		});

		const file = new File(["cover"], "cover.png", { type: "image/png" });
		const image = await createMedia(file);

		const post = await createContent("posts", {
			data: {
				title: "The First Algorithm",
				slug: "first-algorithm",
				body: "An algorithm for the Analytical Engine...",
				published: true,
				author: ada.id,
				category: tech.id,
				tags: [codeTag.id, historyTag.id],
				featuredImage: { id: image.id, path: image.r2Key },
			},
		});

		expect(post.data.title).toBe("The First Algorithm");
		expect(post.data.featuredImage).toEqual({
			id: image.id,
			path: image.r2Key,
		});

		const token = await readerToken();

		// Filter posts by category
		const filtered = await fetchWorker(
			`/collections/posts/content?category=${tech.id}`,
			{},
			token,
		);
		expect(filtered.status).toBe(200);
		const filteredBody = (await filtered.json()) as {
			data: Array<{ data: Record<string, unknown> }>;
		};
		expect(filteredBody.data).toHaveLength(1);

		// Resolve author, category, tags, and featured image
		const resolved = await fetchWorker(
			`/collections/posts/content/${post.id}?resolve=author,category,tags,featuredImage`,
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
		expect(resolvedAuthor.id).toBe(ada.id);
		expect(resolvedAuthor.data.name).toBe("Ada Lovelace");

		const resolvedCategory = resolvedBody.data.category as {
			id: string;
			data: Record<string, unknown>;
		};
		expect(resolvedCategory.data.label).toBe("Technology");

		const resolvedTags = resolvedBody.data.tags as Array<{
			id: string;
			data: Record<string, unknown>;
		}>;
		expect(resolvedTags).toHaveLength(2);
		expect(resolvedTags.map((tag) => tag.data.label).sort()).toEqual([
			"code",
			"history",
		]);

		const resolvedImage = resolvedBody.data.featuredImage as {
			id: string;
			filename: string;
		};
		expect(resolvedImage.id).toBe(image.id);
		expect(resolvedImage.filename).toBe("cover.png");
	});
});
