import { unwrapResult } from "@/lib/errors";
import {
	jsonValidator,
	paramValidator,
	queryValidator,
} from "@/lib/validator";
import {
	collectionSlugParamSchema,
	type CollectionSlugParam,
} from "@/routes/collection/_schema";
import { createRouter } from "@/utils";

import {
	contentQuerySchema,
	contentRouteParamsSchema,
	createContentInputSchema,
	updateContentInputSchema,
	type ContentQuery,
	type ContentRouteParams,
	type CreateContentInput,
	type UpdateContentInput,
} from "./_schema";
import { createContent } from "./_service.post";
import { deleteContent } from "./_service.delete";
import { getContentById } from "./_service.get-by-id";
import { listContent } from "./_service.get";
import { updateContent } from "./_service.patch";
import { validateContent } from "./_service.validate";

export const contentRouter = createRouter()
	.get(
		"/",
		paramValidator<CollectionSlugParam>(collectionSlugParamSchema),
		queryValidator<ContentQuery>(contentQuerySchema),
		async (c) => {
			const params = c.req.valid("param");
			const query = c.req.valid("query");
			const result = await listContent({ slug: params.slug, query }, c.var.deps);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.post(
		"/",
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
		paramValidator<ContentRouteParams>(contentRouteParamsSchema),
		async (c) => {
			const params = c.req.valid("param");
			const result = await getContentById(params, c.var.deps);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.patch(
		"/:id",
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
		paramValidator<ContentRouteParams>(contentRouteParamsSchema),
		async (c) => {
			const params = c.req.valid("param");
			const result = await deleteContent(params, c.var.deps);
			unwrapResult(result);
			return c.body(null, 204);
		},
	);
