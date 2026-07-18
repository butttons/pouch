import { unwrapResult } from "@/lib/errors";
import { jsonValidator, paramValidator, queryValidator } from "@/lib/validator";

import {
	type CollectionSlugParam,
	collectionSlugParamSchema,
} from "@/routes/collection/_schema";

import { requireScopes } from "@/middleware/auth";
import { createRouter } from "@/utils";

import {
	type ContentQuery,
	type ContentRouteParams,
	type CreateContentInput,
	contentQuerySchema,
	contentRouteParamsSchema,
	createContentInputSchema,
	type UpdateContentInput,
	updateContentInputSchema,
} from "./_schema";
import { deleteContent } from "./_service.delete";
import { listContent } from "./_service.get";
import { getContentById } from "./_service.get-by-id";
import { updateContent } from "./_service.patch";
import { createContent } from "./_service.post";

export const contentRouter = createRouter()
	.get(
		"/",
		requireScopes("content:read"),
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
		requireScopes("content:write"),
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
	.get(
		"/:id",
		requireScopes("content:read"),
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
		requireScopes("content:write"),
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
		requireScopes("content:write"),
		paramValidator<ContentRouteParams>(contentRouteParamsSchema),
		async (c) => {
			const params = c.req.valid("param");
			const result = await deleteContent(params, c.var.deps);
			unwrapResult(result);
			return c.body(null, 204);
		},
	);
