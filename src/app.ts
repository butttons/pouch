import { HTTPException } from "hono/http-exception";

import { AppHTTPException, ErrorCodes } from "./lib/errors";
import { depsMiddleware } from "./middleware/deps";
import { collectionRouter } from "./routes/collection/_route";
import { createRouter } from "./utils";

const app = createRouter();

app.use(depsMiddleware);

app.get("/", (c) => c.text("Hello World"));

app.route("/collections", collectionRouter);

app.onError((error, c) => {
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

	return c.json(normalizedError.toJSON(), status as never);
});

export default app;
