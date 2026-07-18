export { BaseDataLayer } from "./_base";
export { DataLayerError } from "./_error";
export * from "./collection";
export * from "./content";
export * from "./content-index";
export * from "./media";

import type { Batcher } from "@/lib/db/batcher";
import type { Database, DatabaseSchema } from "@/lib/db/client";

import { CollectionDataLayer } from "./collection";
import { ContentDataLayer } from "./content";
import { ContentIndexDataLayer } from "./content-index";
import { MediaDataLayer } from "./media";

export const createDL = ({
	db,
	batch,
}: {
	db: Database;
	batch: Batcher<DatabaseSchema>;
}) => {
	return {
		collection: new CollectionDataLayer(db),
		content: new ContentDataLayer(db, batch),
		contentIndex: new ContentIndexDataLayer(db, batch),
		media: new MediaDataLayer(db),
	};
};

export type DataLayer = ReturnType<typeof createDL>;
