import { beforeAll, beforeEach } from "vitest";

import { pouchMigrations } from "./generated-migrations.js";
import { applyD1Migrations, env } from "cloudflare:test";

const TABLE_NAMES = [
	"collections",
	"content",
	"content_indexes",
	"media",
	"schema_versions",
];

async function clearDatabase() {
	for (const table of TABLE_NAMES) {
		await env.DB.prepare(`DELETE FROM ${table};`).run();
	}
}

beforeAll(async () => {
	await applyD1Migrations(env.DB, pouchMigrations);
});

beforeEach(async () => {
	await clearDatabase();
});
