import { unwrapResult } from "@/lib/errors";
import { jsonValidator, paramValidator, queryValidator } from "@/lib/validator";

import {
	type CollectionSlugParam,
	collectionSlugParamSchema,
} from "@/routes/collection/_schema";

import { requireCollectionAccess, requireScopes } from "@/middleware/auth";
import { createRouter } from "@/utils";

import {
	type ContentQuery,
	type ContentRouteParams,
	type CreateContentBatchInput,
	type CreateContentInput,
	contentQuerySchema,
	contentRouteParamsSchema,
	createContentBatchInputSchema,
	createContentInputSchema,
	type DeleteContentBatchInput,
	deleteContentBatchInputSchema,
	type UpdateContentBatchInput,
	type UpdateContentInput,
	updateContentBatchInputSchema,
	updateContentInputSchema,
} from "./_schema";
import { createContentBatch } from "./_service.batch";
import { deleteContentBatch } from "./_service.batch-delete";
import { updateContentBatch } from "./_service.batch-update";
import { deleteContent } from "./_service.delete";
import { listContent } from "./_service.get";
import { getContentById } from "./_service.get-by-id";
import { updateContent } from "./_service.patch";
import { createContent } from "./_service.post";

export const contentRouter = createRouter()
	.use(requireCollectionAccess())
	.get(
		"/",
		requireScopes("collection:read", "content:read"),
		paramValidator<CollectionSlugParam>(collectionSlugParamSchema),
		queryValidator<ContentQuery>(contentQuerySchema),
		async (c) => {
			const params = c.req.valid("param");
			const query = c.req.valid("query");
			const result = await listContent(
				{ slug: params.slug, query },
				c.var.deps,
			);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.post(
		"/",
		requireScopes("collection:read", "content:write"),
		paramValidator<CollectionSlugParam>(collectionSlugParamSchema),
		jsonValidator<CreateContentInput>(createContentInputSchema),
		async (c) => {
			const params = c.req.valid("param");
			const body = c.req.valid("json");
			const result = await createContent(
				{
					slug: params.slug,
					data: body.data,
					status: body.status,
				},
				c.var.deps,
			);
			const value = unwrapResult(result);
			return c.json(value, 201);
		},
	)
	.post(
		"/batch",
		requireScopes("collection:read", "content:write"),
		paramValidator<CollectionSlugParam>(collectionSlugParamSchema),
		jsonValidator<CreateContentBatchInput>(createContentBatchInputSchema),
		async (c) => {
			const params = c.req.valid("param");
			const body = c.req.valid("json");
			const result = await createContentBatch(
				{
					slug: params.slug,
					items: body.items,
				},
				c.var.deps,
			);
			const value = unwrapResult(result);
			return c.json({ data: value }, 201);
		},
	)
	.patch(
		"/batch",
		requireScopes("collection:read", "content:write"),
		paramValidator<CollectionSlugParam>(collectionSlugParamSchema),
		jsonValidator<UpdateContentBatchInput>(updateContentBatchInputSchema),
		async (c) => {
			const params = c.req.valid("param");
			const body = c.req.valid("json");
			const result = await updateContentBatch(
				{
					slug: params.slug,
					items: body.items,
				},
				c.var.deps,
			);
			const value = unwrapResult(result);
			return c.json({ data: value });
		},
	)
	.delete(
		"/batch",
		requireScopes("collection:read", "content:write"),
		paramValidator<CollectionSlugParam>(collectionSlugParamSchema),
		jsonValidator<DeleteContentBatchInput>(deleteContentBatchInputSchema),
		async (c) => {
			const params = c.req.valid("param");
			const body = c.req.valid("json");
			const result = await deleteContentBatch(
				{
					slug: params.slug,
					ids: body.ids,
				},
				c.var.deps,
			);
			unwrapResult(result);
			return c.body(null, 204);
		},
	)
	.get(
		"/:id",
		requireScopes("collection:read", "content:read"),
		paramValidator<ContentRouteParams>(contentRouteParamsSchema),
		queryValidator<ContentQuery>(contentQuerySchema),
		async (c) => {
			const params = c.req.valid("param");
			const query = c.req.valid("query");
			const result = await getContentById(
				{ ...params, resolve: query.resolve },
				c.var.deps,
			);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.patch(
		"/:id",
		requireScopes("collection:read", "content:write"),
		paramValidator<ContentRouteParams>(contentRouteParamsSchema),
		jsonValidator<UpdateContentInput>(updateContentInputSchema),
		async (c) => {
			const params = c.req.valid("param");
			const body = c.req.valid("json");
			const result = await updateContent(
				{
					slug: params.slug,
					id: params.id,
					data: body.data,
					status: body.status,
				},
				c.var.deps,
			);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.delete(
		"/:id",
		requireScopes("collection:read", "content:write"),
		paramValidator<ContentRouteParams>(contentRouteParamsSchema),
		async (c) => {
			const params = c.req.valid("param");
			const result = await deleteContent(params, c.var.deps);
			unwrapResult(result);
			return c.body(null, 204);
		},
	);
