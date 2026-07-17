import { HTTPException } from "hono/http-exception";

import { AppHTTPException, ErrorCodes } from "./lib/errors";
import { unwrapResult } from "./lib/errors";
import { assembleOpenAPIDocument } from "./lib/openapi";
import { depsMiddleware } from "./middleware/deps";
import { collectionRouter } from "./routes/collection/_route";
import { createRouter } from "./utils";

const app = createRouter()
  .use(depsMiddleware)
  .get("/openapi.json", async (c) => {
    const result = await assembleOpenAPIDocument(c.var.deps);
    const value = unwrapResult(result);
    return c.json(value);
  })
  .route("/collections", collectionRouter)
  .notFound((c) =>
    c.json(
      {
        code: ErrorCodes.NOT_FOUND,
        message: "Not found",
        status: 404,
      },
      404,
    ),
  )
  .onError((error, c) => {
    const status = error instanceof HTTPException ? error.status : 500;

    const normalizedError =
      error instanceof AppHTTPException
        ? error
        : new AppHTTPException({
            cause: error,
            message: error.message ?? "Unknown error",
            code: ErrorCodes.INTERNAL_ERROR,
            status,
          });

    console.error("Request failed", {
      path: c.req.path,
      method: c.req.method,
      rayId: c.req.header("cf-ray"),
      code: normalizedError.code,
      status,
      error: normalizedError,
    });

    return c.json(normalizedError.toJSON(), status as never);
  });

export default app;
