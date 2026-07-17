import { fromPromise } from "neverthrow";
import { sql } from "kysely";

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
				.select([
					"id",
					"slug",
					"name",
					"title_field as titleField",
					sql<Record<string, unknown>>`schema`.as("schema"),
				])
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
			this.db
				.insertInto("collections")
				.values(
					this.forInsert({
						slug: input.slug,
						name: input.name,
						schema: input.schema,
						title_field: input.titleField,
					}),
				)
				.returning(["id", "slug", "name", "title_field as titleField"])
				.executeTakeFirstOrThrow(),
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
				.select([
					"id",
					"slug",
					"name",
					"title_field as titleField",
				])
				.orderBy("created_at", "desc")
				.execute(),
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
				.select([
					"id",
					"slug",
					"name",
					"title_field as titleField",
					sql<Record<string, unknown>>`schema`.as("schema"),
				])
				.orderBy("created_at", "desc")
				.execute(),
			this.passThroughError({
				message: "Failed to list collections with schema",
				code: "GET_FAILED",
				source: "DL.collection.listCollectionsWithSchema",
				input: {},
			}),
		);
	}

	getCollectionById(input: { id: string }) {
		return fromPromise(
			this.db
				.selectFrom("collections")
				.select([
					"id",
					"slug",
					"name",
					"title_field as titleField",
					sql<Record<string, unknown>>`schema`.as("schema"),
				])
				.where("id", "=", input.id)
				.executeTakeFirst(),
			this.passThroughError({
				message: "Failed to get collection by ID",
				code: "GET_FAILED",
				source: "DL.collection.getCollectionById",
				input,
			}),
		);
	}

	countContentByCollectionId(input: { collectionId: string }) {
		return fromPromise(
			this.db
				.selectFrom("content")
				.select((eb) => eb.fn.countAll<number>().as("count"))
				.where("collection_id", "=", input.collectionId)
				.executeTakeFirst(),
			this.passThroughError({
				message: "Failed to count content by collection",
				code: "GET_FAILED",
				source: "DL.collection.countContentByCollectionId",
				input,
			}),
		);
	}

	deleteCollectionById(input: { id: string }) {
		return fromPromise(
			this.db
				.deleteFrom("collections")
				.where("id", "=", input.id)
				.execute(),
			this.passThroughError({
				message: "Failed to delete collection",
				code: "DELETE_FAILED",
				source: "DL.collection.deleteCollectionById",
				input,
			}),
		);
	}
}
