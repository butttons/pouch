import { unwrapResult } from "@/lib/errors";
import { paramValidator, queryValidator } from "@/lib/validator";
import { requireScopes } from "@/middleware/auth";
import { createRouter } from "@/utils";

import {
	mediaIdParamSchema,
	mediaQuerySchema,
	type MediaIdParam,
	type MediaQuery,
} from "./_schema";
import { createMedia } from "./_service.post";
import { deleteMedia } from "./_service.delete";
import { getMediaById } from "./_service.get-by-id";
import { listMedia } from "./_service.get";

export const mediaRouter = createRouter()
	.get(
		"/",
		requireScopes("content:read"),
		queryValidator<MediaQuery>(mediaQuerySchema),
		async (c) => {
			const query = c.req.valid("query");
			const result = await listMedia({ query }, c.var.deps);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.post("/", requireScopes("content:write"), async (c) => {
		const body = await c.req.parseBody({ all: false });
		const file = body.file;

		if (!(file instanceof File)) {
			return c.json(
				{
					code: "VALIDATION_FAILED",
					message: "Expected a single file under the 'file' field",
					status: 400,
				},
				400,
			);
		}

		const result = await createMedia({ file }, c.var.deps);
		const value = unwrapResult(result);
		return c.json(value, 201);
	})
	.get(
		"/:id",
		requireScopes("content:read"),
		paramValidator<MediaIdParam>(mediaIdParamSchema),
		async (c) => {
			const params = c.req.valid("param");
			const result = await getMediaById(params, c.var.deps);
			const value = unwrapResult(result);
			return c.json(value);
		},
	)
	.get(
		"/:id/file",
		requireScopes("content:read"),
		paramValidator<MediaIdParam>(mediaIdParamSchema),
		async (c) => {
			const params = c.req.valid("param");
			const result = await getMediaById(params, c.var.deps);
			const media = unwrapResult(result);

			const object = await c.var.deps.bucket.get(media.r2Key);

			if (!object || !("body" in object)) {
				return c.json(
					{
						code: "NOT_FOUND",
						message: "File not found in storage",
						status: 404,
					},
					404,
				);
			}

			const headers = new Headers();
			object.writeHttpMetadata(headers);
			headers.set("etag", object.httpEtag);
			headers.set("content-length", object.size.toString());

			return new Response(object.body, { headers });
		},
	)
	.delete(
		"/:id",
		requireScopes("content:write"),
		paramValidator<MediaIdParam>(mediaIdParamSchema),
		async (c) => {
			const params = c.req.valid("param");
			const result = await deleteMedia(params, c.var.deps);
			unwrapResult(result);
			return c.body(null, 204);
		},
	);
