export * from "./collection";
export * from "./content";
export { DataLayerError } from "./_error";
export { BaseDataLayer } from "./_base";

import { CollectionDataLayer } from "./collection";
import { ContentDataLayer } from "./content";
import type { Database } from "../db/client";

export const createDL = ({ db }: { db: Database }) => {
	return {
		collection: new CollectionDataLayer(db),
		content: new ContentDataLayer(db),
	};
};

export type DataLayer = ReturnType<typeof createDL>;
