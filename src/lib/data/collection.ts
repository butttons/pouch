import { sql } from "kysely";
import { fromPromise } from "neverthrow";

import type { Database } from "@/lib/db/client";

import { BaseDataLayer } from "./_base";

export class CollectionDataLayer extends BaseDataLayer {
	constructor(private db: Database) {
		super();
		this.entity = "collection";
	}

	get collectionQuery() {
		return this.db
			.selectFrom("collections")
			.select([
				"id",
				"slug",
				"name",
				"title_field as titleField",
				"current_schema_version_id as currentSchemaVersionId",
				sql<Record<string, unknown>>`schema`.as("schema"),
			]);
	}

	getCollectionBySlug(input: { slug: string }) {
		return fromPromise(
			this.collectionQuery.where("slug", "=", input.slug).executeTakeFirst(),
			this.passThroughError({
				message: "Failed to get collection by slug",
				code: "GET_FAILED",
				source: "DL.collection.getCollectionBySlug",
				input,
			}),
		);
	}

	getCollectionsBySlugs(input: { slugs: string[] }) {
		return fromPromise(
			this.collectionQuery.where("slug", "in", input.slugs).execute(),
			this.passThroughError({
				message: "Failed to get collections by slugs",
				code: "GET_FAILED",
				source: "DL.collection.getCollectionsBySlugs",
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
				.select(["id", "slug", "name", "title_field as titleField"])
				.orderBy("id", "desc")
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
				.orderBy("id", "desc")
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
			this.collectionQuery.where("id", "=", input.id).executeTakeFirst(),
			this.passThroughError({
				message: "Failed to get collection by ID",
				code: "GET_FAILED",
				source: "DL.collection.getCollectionById",
				input,
			}),
		);
	}

	createSchemaVersion(input: {
		id: string;
		collectionId: string;
		schema: string;
		changeDiff: string | null;
	}) {
		return fromPromise(
			this.db
				.insertInto("schema_versions")
				.values({
					id: input.id,
					collection_id: input.collectionId,
					schema: input.schema,
					change_diff: input.changeDiff,
					applied_by: null,
					created_at: Date.now(),
				})
				.returning(["id"])
				.executeTakeFirstOrThrow(),
			this.passThroughError({
				message: "Failed to create schema version",
				code: "CREATE_FAILED",
				source: "DL.collection.createSchemaVersion",
				input,
			}),
		);
	}

	updateCollectionSchema(input: {
		id: string;
		schema: string;
		currentSchemaVersionId: string;
	}) {
		return fromPromise(
			this.db
				.updateTable("collections")
				.set(
					this.forUpdate({
						schema: input.schema,
						current_schema_version_id: input.currentSchemaVersionId,
					}),
				)
				.where("id", "=", input.id)
				.returning([
					"id",
					"slug",
					"name",
					"title_field as titleField",
					"current_schema_version_id as currentSchemaVersionId",
					sql<Record<string, unknown>>`schema`.as("schema"),
				])
				.executeTakeFirstOrThrow(),
			this.passThroughError({
				message: "Failed to update collection schema",
				code: "UPDATE_FAILED",
				source: "DL.collection.updateCollectionSchema",
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
			this.db.deleteFrom("collections").where("id", "=", input.id).execute(),
			this.passThroughError({
				message: "Failed to delete collection",
				code: "DELETE_FAILED",
				source: "DL.collection.deleteCollectionById",
				input,
			}),
		);
	}
}
