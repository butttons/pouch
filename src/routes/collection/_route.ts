import { unwrapResult } from "@/lib/errors";
import { jsonValidator, paramValidator, queryValidator } from "@/lib/validator";
import { createRouter } from "@/utils";

import {
  collectionSlugParamSchema,
  createCollectionInputSchema,
  deleteCollectionQuerySchema,
  patchCollectionSchemaInputSchema,
  type CollectionSlugParam,
  type CreateCollectionInput,
  type DeleteCollectionQuery,
  type PatchCollectionSchemaInput,
} from "./_schema";
import { contentRouter } from "@/routes/content/_route";
import {
  createContentInputSchema as validateContentInputSchema,
  type CreateContentInput,
} from "@/routes/content/_schema";
import { validateContent } from "@/routes/content/_service.validate";
import { createCollection } from "./_service.post";
import { deleteCollection } from "./_service.delete";
import { getCollectionBySlug } from "./_service.get-by-slug";
import { getCollectionSchemaBySlug } from "./_service.get-schema";
import { listCollections } from "./_service.get";
import { patchCollectionSchema } from "./_service.patch-schema";

export const collectionRouter = createRouter()
  .get("/", async (c) => {
    const result = await listCollections(c.var.deps);
    const value = unwrapResult(result);
    return c.json(value);
  })
  .post(
    "/",
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
