export { BaseDataLayer } from "./_base";
export { DataLayerError } from "./_error";
export * from "./audit-log";
export * from "./collection";
export * from "./content";
export * from "./content-index";
export * from "./media";

import type { Batcher } from "@/lib/db/batcher";
import type { Database, DatabaseSchema } from "@/lib/db/client";

import { AuditLogDataLayer } from "./audit-log";
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
		auditLog: new AuditLogDataLayer(db),
		collection: new CollectionDataLayer(db, batch),
		content: new ContentDataLayer(db, batch),
		contentIndex: new ContentIndexDataLayer(db, batch),
		media: new MediaDataLayer(db, batch),
	};
};

export type DataLayer = ReturnType<typeof createDL>;
