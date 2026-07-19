# pouch — Agent Guide

API-first headless CMS for Cloudflare (D1 + Workers). No admin UI — the API is the product. Primary consumers are AI agents and services.

## Stack

- Hono on Cloudflare Workers
- D1 (SQLite)
- Drizzle for schema definitions and migrations
- Kysely for runtime query construction
- TypeBox for JSON Schema validation
- `hono/jwt` for API key signing and verification
- `openapi-typescript` + `openapi-fetch` for typed clients

## IDs

UUIDv7, prefixed by namespace:

- `col_` — collections
- `con_` — content
- `sch_` — schema versions
- `med_` — media
- `cix_` — content indexes
- `key_` — API keys

Time-sortable. No separate ordering column.

## Field type → JSON Schema mapping

Collection schemas are standard JSON Schema (draft 2020-12). CMS-specific behavior is expressed through five `x-` keywords only:

- `x-label` — display name for the field. Property keys are immutable; labels are mutable.
- `x-widget` — authoring hint only. `"richtext"` is the only supported value today.
- `x-relation` — target collection slug. `type: "string"` = single relation; `type: "array"` = many.
- `x-index` — scalar fields only (`string`, `integer`, `number`, `boolean`). Creates a generated column + index for filtering.
- `x-media` — marks an object field as a media reference. The stored value must be `{ id: "med_...", path: string }`. Use `type: "array"` for many media references. Request `?resolve=<field>` to expand it into the full media record(s).

```jsonc
// text
{ "type": "string" }

// richtext
{ "type": "string", "x-widget": "richtext" }

// number
{ "type": "number" }              // integer → { "type": "integer" }

// boolean
{ "type": "boolean" }

// date
{ "type": "string", "format": "date" }

// select
{ "type": "string", "enum": ["draft", "published", "archived"] }

// relation (single)
{ "type": "string", "x-relation": "authors" }

// relation (many)
{ "type": "array", "items": { "type": "string" }, "x-relation": "authors" }

// indexed field
{ "type": "number", "x-index": true }

// media (single)
{ "type": "object", "x-media": true }

// media (many)
{ "type": "array", "items": { "type": "object" }, "x-media": true }

// json
{}
```

`format: "date"` is an annotation and is not auto-enforced by TypeBox. Register it via `FormatRegistry.Set('date', ...)` or invalid dates will silently pass.

## Query filter operators

Content list endpoints accept `?field=value` (equality) and `?field[op]=value`. Valid operators depend on the field's JSON Schema type:

- `number`, `integer`: `eq`, `ne`, `gt`, `gte`, `in`, `lt`, `lte`, `nin`
- `boolean`: `eq`, `ne`, `in`, `nin`
- `string` with `format: "date"`: `eq`, `ne`, `in`, `gt`, `gte`, `lt`, `lte`, `nin`
- `string` (all other): `eq`, `ne`, `in`, `nin`
- `array`, `object`: not filterable

Both the request validator in `src/routes/content/_service.get.ts` and the OpenAPI generator in `src/lib/openapi.ts` must derive allowed operators from the same mapping in `src/lib/query-filter.ts`.

## Schema philosophy

- `collections.schema` is standard JSON Schema, stored as-is.
- Property keys are immutable. Renaming a label is not the same as removing and re-adding a key.
- No EAV, no table-per-collection, no views. The shared `content` table shape is fixed.

## Code patterns

- Use `neverthrow` for all fallible operations. No `try/catch` for control flow.
- Every error response must be JSON, including 404s and unhandled exceptions.
- Data layer methods are thin Kysely wrappers. Business rules live in services.
- `DataLayer` is a class with public sub-layer properties (`auditLog`, `collection`, `content`, `contentIndex`, `media`). Instantiate it with `new DataLayer({ db, batch })` — do not use a factory function.
- Audit log inserts are built via `AuditLogDataLayer.createInsert(db, event)` static method. Other data layers import this from `./audit-log` sibling module, not from `@/lib/audit-log`.
- Audit is required on all mutating data layer methods (create, update, delete). Callers in services always pass an `AuditLogEvent`.
- Define route schemas with TypeBox and infer TS types from them. Do not hand-write interfaces that duplicate the schema.
- Colocate static OpenAPI pieces with routes (`_openapi.ts`). `src/lib/openapi.ts` only assembles.

## Database changes

1. Edit `src/lib/db/schema.ts` (Drizzle table definitions).
2. Run `pnpm db:generate` to generate a new Drizzle migration.
3. Run `pnpm db:migrate` to apply it to the local D1 database.
4. Run `pnpm db:codegen` to regenerate Kysely types from the updated schema.
5. Run `pnpm generate-test-migrations` to regenerate `test/generated-migrations.ts` for the test suite.
6. Run `pnpm test` to verify nothing broke.

## Testing

- Integration tests only, run against the real `worker.fetch()` with `@cloudflare/vitest-pool-workers`.
- No unit tests for thin data-layer wrappers or validators.
- `pnpm test` runs the suite.
- `pnpm generate-test-migrations` regenerates `test/generated-migrations.ts` after schema changes.

## Explicitly cut

- Content versioning / history.
- Relation referential integrity (app-level, deliberate).
- Schema-mutation concurrency lock.
- JWT revocation / blocklist.
- Idempotency keys on writes.
- Per-collection views or ad-hoc generated columns outside `x-index`.
