import { fromPromise } from "neverthrow";

import type { Database } from "../db/client";

import { BaseDataLayer } from "./_base";

export class CollectionDataLayer extends BaseDataLayer {
	constructor(private db: Database) {
		super();
		this.entity = "collection";
	}

	getCollectionBySlug(input: { slug: string }) {
		return fromPromise(
			this.db
				.selectFrom("collections")
				.select(["id"])
				.where("slug", "=", input.slug)
				.executeTakeFirst(),
			this.passThroughError({
				message: "Failed to get collection by slug",
				code: "GET_FAILED",
				source: "DL.collection.getCollectionBySlug",
				input,
			}),
		);
	}

	createCollection(input: {
		slug: string;
		name: string;
		schema: string;
		titleField: string | null;
	}) {
		return fromPromise(
			(async () => {
				const row = this.forInsert({
					slug: input.slug,
					name: input.name,
					schema: input.schema,
					title_field: input.titleField,
				});

				await this.db.insertInto("collections").values(row).execute();

				return {
					id: row.id,
					slug: row.slug,
					name: row.name,
					titleField: row.title_field,
				};
			})(),
			this.passThroughError({
				message: "Failed to create collection",
				code: "CREATE_FAILED",
				source: "DL.collection.createCollection",
				input,
			}),
		);
	}

	listCollections() {
		return fromPromise(
			this.db
				.selectFrom("collections")
				.select(["id", "slug", "name", "title_field"])
				.orderBy("created_at", "desc")
				.execute()
				.then((rows) =>
					rows.map((row) => ({
						id: row.id,
						slug: row.slug,
						name: row.name,
						titleField: row.title_field,
					})),
				),
			this.passThroughError({
				message: "Failed to list collections",
				code: "GET_FAILED",
				source: "DL.collection.listCollections",
				input: {},
			}),
		);
	}

	listCollectionsWithSchema() {
		return fromPromise(
			this.db
				.selectFrom("collections")
				.select(["id", "slug", "name", "title_field", "schema"])
				.orderBy("created_at", "desc")
				.execute()
				.then((rows) =>
					rows.map((row) => ({
						id: row.id,
						slug: row.slug,
						name: row.name,
						titleField: row.title_field,
						schema: row.schema,
					})),
				),
			this.passThroughError({
				message: "Failed to list collections with schema",
				code: "GET_FAILED",
				source: "DL.collection.listCollectionsWithSchema",
				input: {},
			}),
		);
	}
}
