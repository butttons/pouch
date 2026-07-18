import { ok, ResultAsync, safeTry } from "neverthrow";

import type { DataLayerError } from "@/lib/data";

import type { Collection } from "./_schema";
import type { Deps } from "@/deps";

export const listCollections = (
	deps: Deps,
): ResultAsync<Collection[], DataLayerError> =>
	safeTry(async function* () {
		const collections = yield* deps.DL.collection.listCollections();
		return ok(collections);
	});
