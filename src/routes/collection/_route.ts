import { unwrapResult } from "@/lib/errors";
import { jsonValidator } from "@/lib/validator";
import { createRouter } from "@/utils";

import { createCollectionInputSchema } from "./_schema";
import { createCollection } from "./_service.post";

export const collectionRouter = createRouter();

collectionRouter.post(
	"/",
	jsonValidator<{
		slug: string;
		name: string;
		schema: Record<string, unknown>;
		titleField?: string;
	}>(createCollectionInputSchema),
	async (c) => {
		const input = c.req.valid("json");
		const result = await createCollection(input, c.var.deps);
		const value = unwrapResult(result);
		return c.json(value, 201);
	},
);
