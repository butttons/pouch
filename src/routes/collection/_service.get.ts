import { ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";
import type { Deps } from "@/deps";
import type { Collection } from "./_schema";

export const listCollections = (
	deps: Deps,
): ResultAsync<Collection[], DataLayerError> =>
	safeTry(async function* () {
		const collections = yield* deps.DL.collection.listCollections();
		return ok(collections);
	});
