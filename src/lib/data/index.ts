export * from "./collection";
export * from "./content";
export * from "./content-index";
export { DataLayerError } from "./_error";
export { BaseDataLayer } from "./_base";

import { CollectionDataLayer } from "./collection";
import { ContentDataLayer } from "./content";
import { ContentIndexDataLayer } from "./content-index";
import type { Database } from "../db/client";

export const createDL = ({ db }: { db: Database }) => {
	return {
		collection: new CollectionDataLayer(db),
		content: new ContentDataLayer(db),
		contentIndex: new ContentIndexDataLayer(db),
	};
};

export type DataLayer = ReturnType<typeof createDL>;
