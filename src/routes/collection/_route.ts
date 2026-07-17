import { unwrapResult } from "@/lib/errors";
import { jsonValidator, paramValidator, queryValidator } from "@/lib/validator";
import { createRouter } from "@/utils";

import {
  collectionIdParamSchema,
  createCollectionInputSchema,
  deleteCollectionQuerySchema,
  type CollectionIdParam,
  type CreateCollectionInput,
  type DeleteCollectionQuery,
} from "./_schema";
import { createCollection } from "./_service.post";
import { deleteCollection } from "./_service.delete";
import { getCollectionById } from "./_service.get-by-id";
import { listCollections } from "./_service.get";

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
    "/:id",
    paramValidator<CollectionIdParam>(collectionIdParamSchema),
    async (c) => {
      const input = c.req.valid("param");
      const result = await getCollectionById(input, c.var.deps);
      const value = unwrapResult(result);
      return c.json(value);
    },
  )
  .delete(
    "/:id",
    paramValidator<CollectionIdParam>(collectionIdParamSchema),
    queryValidator<DeleteCollectionQuery>(deleteCollectionQuerySchema),
    async (c) => {
      const params = c.req.valid("param");
      const query = c.req.valid("query");
      const result = await deleteCollection(
        { ...params, isForced: query.force === "true" },
        c.var.deps,
      );
      unwrapResult(result);
      return c.body(null, 204);
    },
  );
