import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, beforeEach } from "vitest";

import { feedrMigrations } from "./generated-migrations.js";

const TABLE_NAMES = [
  "audit_log",
  "collections",
  "content",
  "media",
  "schema_versions",
];

async function clearDatabase() {
  for (const table of TABLE_NAMES) {
    await env.DB.prepare(`DELETE FROM ${table};`).run();
  }
}

beforeAll(async () => {
  await applyD1Migrations(env.DB, feedrMigrations);
});

beforeEach(async () => {
  await clearDatabase();
});
