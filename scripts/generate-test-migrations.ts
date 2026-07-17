import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIRNAME = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(DIRNAME, "../src/lib/db/migrations");
const OUTPUT_FILE = join(DIRNAME, "../test/generated-migrations.ts");

const files = readdirSync(MIGRATIONS_DIR)
  .filter((file) => file.endsWith(".sql"))
  .sort();

const migrations = files.map((name) => {
  const content = readFileSync(join(MIGRATIONS_DIR, name), "utf-8");
  const queries = content
    .split("--> statement-breakpoint")
    .map((query) => query.trim())
    .filter(Boolean);

  return { name, queries };
});

const ts = `// Generated from src/lib/db/migrations/*.sql
// Do not edit manually. Run: pnpm generate-test-migrations

export const feedrMigrations = ${JSON.stringify(migrations, null, 2)};
`;

writeFileSync(OUTPUT_FILE, ts);
console.log(`Generated ${OUTPUT_FILE} from ${files.length} migration files`);
