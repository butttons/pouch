import { unwrapResult } from "@/lib/errors";
import { jsonValidator, paramValidator, queryValidator } from "@/lib/validator";

import { contentRouter } from "@/routes/content/_route";
import {
	type CreateContentInput,
	createContentInputSchema as validateContentInputSchema,
} from "@/routes/content/_schema";
import { validateContent } from "@/routes/content/_service.validate";

import {
	getPermittedCollections,
	requireCollectionAccess,
	requireScopes,
} from "@/middleware/auth";
import { createRouter } from "@/utils";

import {
	type CollectionSlugParam,
	type CreateCollectionInput,
	collectionSlugParamSchema,
	createCollectionInputSchema,
	type DeleteCollectionQuery,
	deleteCollectionQuerySchema,
	type PatchCollectionSchemaInput,
	patchCollectionSchemaInputSchema,
} from "./_schema";
import { deleteCollection } from "./_service.delete";
import { listCollections } from "./_service.get";
import { getCollectionBySlug } from "./_service.get-by-slug";
import { getCollectionSchemaBySlug } from "./_service.get-schema";
import { patchCollectionSchema } from "./_service.patch-schema";
import { createCollection } from "./_service.post";

export const collectionRouter = createRouter()
	.get("/", requireScopes("collection:read"), async (c) => {
		const result = await listCollections(c.var.deps);
		const value = unwrapResult(result);
		const permittedCollections = getPermittedCollections(c.var.jwtPayload);
		if (permittedCollections === null) {
			return c.json(value);
		}
		return c.json(
			value.filter((collection) =>
				permittedCollections.includes(collection.slug),
			),
		);
	})
	.post(
		"/",
		requireScopes("collection:write"),
		jsonValidator<CreateCollectionInput>(createCollectionInputSchema),
		async (c) => {
			const input = c.req.valid("json");
			const result = await createCollection(input, c.var.deps);
			const value = unwrapResult(result);
			return c.json(value, 201);
		},
	)
	.get(
		"/:slug/schema",
		requireScopes("collection:read"),
		requireCollectionAccess(),
		paramValidator<CollectionSlugParam>(collectionSlugParamSchema),
		async (c) => {
			const input = c.req.valid("param");
			const result = await getCollectionSchemaBySlug(input, c.var.deps);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.patch(
		"/:slug/schema",
		requireScopes("collection:write"),
		requireCollectionAccess(),
		paramValidator<CollectionSlugParam>(collectionSlugParamSchema),
		jsonValidator<PatchCollectionSchemaInput>(patchCollectionSchemaInputSchema),
		async (c) => {
			const params = c.req.valid("param");
			const body = c.req.valid("json");
			const result = await patchCollectionSchema(
				{
					slug: params.slug,
					schema: body.schema,
					force: body.force,
				},
				c.var.deps,
			);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.post(
		"/:slug/content:validate",
		requireScopes("collection:read", "content:write"),
		requireCollectionAccess(),
		paramValidator<CollectionSlugParam>(collectionSlugParamSchema),
		jsonValidator<CreateContentInput>(validateContentInputSchema),
		async (c) => {
			const params = c.req.valid("param");
			const body = c.req.valid("json");
			const result = await validateContent(
				{
					slug: params.slug,
					data: body.data,
					status: body.status,
				},
				c.var.deps,
			);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.route("/:slug/content", contentRouter)
	.get(
		"/:slug",
		requireScopes("collection:read"),
		requireCollectionAccess(),
		paramValidator<CollectionSlugParam>(collectionSlugParamSchema),
		async (c) => {
			const input = c.req.valid("param");
			const result = await getCollectionBySlug(input, c.var.deps);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.delete(
		"/:slug",
		requireScopes("collection:write"),
		requireCollectionAccess(),
		paramValidator<CollectionSlugParam>(collectionSlugParamSchema),
		queryValidator<DeleteCollectionQuery>(deleteCollectionQuerySchema),
		async (c) => {
			const params = c.req.valid("param");
			const query = c.req.valid("query");
			const result = await deleteCollection(
				{
					slug: params.slug,
					isForced: query.force === "true",
				},
				c.var.deps,
			);
			unwrapResult(result);
			return c.body(null, 204);
		},
	);
