import { ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import type { AppHTTPException } from "@/lib/errors";
import { requireCollectionBySlug } from "@/routes/collection/_util.require-collection";
import {
	validateContentOrFail,
	validateMediaFieldsOrFail,
} from "./_util.validate-content";
import type { CollectionSlugParam } from "@/routes/collection/_schema";
import type { CreateContentInput } from "./_schema";

export const validateContent = (
	input: CollectionSlugParam & CreateContentInput,
	deps: Deps,
): ResultAsync<{ valid: boolean }, AppHTTPException | DataLayerError> =>
	safeTry(async function* () {
		const collection = yield* requireCollectionBySlug(
			{ slug: input.slug },
			deps,
		);

		yield* validateContentOrFail({ data: input.data, schema: collection.schema });
		yield* validateMediaFieldsOrFail({
			data: input.data,
			schema: collection.schema,
			DL: deps.DL,
		});

		return ok({ valid: true });
	});
