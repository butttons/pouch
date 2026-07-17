import { unwrapResult } from "@/lib/errors";
import { jsonValidator } from "@/lib/validator";
import { createRouter } from "@/utils";

import {
	createCollectionInputSchema,
	type CreateCollectionInput,
} from "./_schema";
import { createCollection } from "./_service.post";
import { listCollections } from "./_service.get";

export const collectionRouter = createRouter();

collectionRouter.get("/", async (c) => {
	const result = await listCollections(c.var.deps);
	const value = unwrapResult(result);
	return c.json(value);
});

collectionRouter.post(
	"/",
	jsonValidator<CreateCollectionInput>(createCollectionInputSchema),
	async (c) => {
		const input = c.req.valid("json");
		const result = await createCollection(input, c.var.deps);
		const value = unwrapResult(result);
		return c.json(value, 201);
	},
);
