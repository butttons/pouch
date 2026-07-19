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

export class DataLayer {
	public auditLog: AuditLogDataLayer;
	public collection: CollectionDataLayer;
	public content: ContentDataLayer;
	public contentIndex: ContentIndexDataLayer;
	public media: MediaDataLayer;

	constructor({ db, batch }: { db: Database; batch: Batcher<DatabaseSchema> }) {
		this.auditLog = new AuditLogDataLayer(db, batch);
		this.collection = new CollectionDataLayer(db, batch);
		this.content = new ContentDataLayer(db, batch);
		this.contentIndex = new ContentIndexDataLayer(db, batch);
		this.media = new MediaDataLayer(db, batch);
	}
}
