export * from "./collection";
export { DataLayerError } from "./_error";
export { BaseDataLayer } from "./_base";

import { CollectionDataLayer } from "./collection";
import type { Database } from "../db/client";

export const createDL = ({ db }: { db: Database }) => {
	return {
		collection: new CollectionDataLayer(db),
	};
};

export type DataLayer = ReturnType<typeof createDL>;
