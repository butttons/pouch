# Headless CMS — Build Spec

API-first headless CMS for Cloudflare (D1 + Workers). No admin UI — API is the product, primary consumers are AI agents, not humans clicking through a dashboard.

## Stack

- Hono on Cloudflare Workers — first-class documented target, chosen over Elysia (Elysia's Workers support is an experimental adapter, fs-dependent features broken)
- D1 (SQLite)
- Drizzle — schema definitions + `drizzle-kit generate`/`migrate` own DDL history. Source of truth for table shape, replaces hand-written migration SQL.
- Kysely — all runtime query construction (joins, pagination, filters, `$dynamic()` + raw `json_extract`). Drizzle defines the schema, Kysely builds the queries — not a replacement of one by the other.
- TypeBox (`@sinclair/typebox`, standalone) — consumes raw JSON Schema directly via `TypeCompiler.Compile()`, no builder/intermediate type needed
- `hono/jwt` (`sign()`/`verify()`) for agent API keys, no auth framework. Everything beyond sign/verify (revocation, refresh) is hand-rolled — see Auth section.
- `openapi-typescript` + `openapi-fetch` for client — spec-driven, single codegen pass covers both route typing and content shape typing

## IDs

- UUIDv7, prefixed by namespace: `col_`, `con_`, `sch_`, `med_`, `aud_`. Time-sortable, no separate ordering column needed anywhere.

## Field type → JSON Schema mapping

Three `x-` keywords total, kept minimal on purpose — everything else is standard JSON Schema doing real validation work.

- **`x-widget`** — presentation/authoring hint only, never affects validation. `"richtext"` for now; general-purpose escape hatch for future same-JSON-type-different-meaning cases (extend the enum, don't add a new keyword).
- **`x-relation`** — target collection slug. Field `type: "string"` + `x-relation` = single relation; `type: "array"` + `x-relation` = many. No separate boolean needed, `type` already carries that distinction. `media` is just a relation to the system `media` collection, not its own construct.
- **`x-label`** — display name, mutable, separate from the immutable property key (see Schema philosophy above).

```jsonc
// text
{ "type": "string" }

// richtext
{ "type": "string", "x-widget": "richtext" }

// number
{ "type": "number" }              // integer: true → { "type": "integer" }

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

// media
{ "type": "string", "x-relation": "media" }

// json
{}
```

**`format: "date"` is a JSON Schema annotation, not auto-enforced by TypeBox** — same gap ajv has without `ajv-formats`. Must register via `FormatRegistry.Set('date', ...)` or invalid date strings silently pass validation.

## Schema philosophy

- `collections.schema` is **standard JSON Schema** (draft 2020-12), stored as-is. No bespoke field-def format, no builder.
- CMS-specific metadata goes in `x-` prefixed custom keywords (spec-legal, ignored harmlessly by validators) — full mapping above.
- Property **key is immutable**; `x-label` is freely renamable. This is what makes diff-based versioning correctly distinguish "renamed label" (in-place edit) from "removed+added key" (structural, destructive).
- No EAV (join-per-field cost, broken type-affinity/indexing, multiplies D1 query count).
- No table-per-collection, no generated/indexed columns, no views. Considered and cut for simplicity at current scale — see "Explicitly cut" below.

## D1 Schema

Authored as Drizzle schema definitions; DDL below shown as SQL for clarity of shape only — actual source of truth is the Drizzle schema file + generated migrations.

```sql
CREATE TABLE collections (
  id                        TEXT PRIMARY KEY,   -- col_<uuidv7>
  slug                       TEXT NOT NULL UNIQUE,
  name                       TEXT NOT NULL,
  schema                     TEXT NOT NULL,      -- JSON Schema, current
  current_schema_version_id  TEXT REFERENCES schema_versions(id),
  title_field                TEXT,               -- which property is the display field
  created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE content (
  id                 TEXT PRIMARY KEY,   -- con_<uuidv7>
  collection_id      TEXT NOT NULL REFERENCES collections(id),
  data               TEXT NOT NULL,      -- JSON, validated against collections.schema
  status             TEXT NOT NULL DEFAULT 'draft',
  schema_version_id  TEXT NOT NULL REFERENCES schema_versions(id),  -- version live at write time; breadcrumb, not a branch key
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_content_collection_status ON content(collection_id, status);
-- Physical shape of this table is fixed forever after creation. No ALTER TABLE from schema mutations.

CREATE TABLE schema_versions (
  id             TEXT PRIMARY KEY,   -- sch_<uuidv7>, sortable, doubles as ordering
  collection_id  TEXT NOT NULL REFERENCES collections(id),
  schema         TEXT NOT NULL,      -- full snapshot
  change_diff    TEXT,               -- json-diff output vs prior version
  applied_by     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE media (
  id          TEXT PRIMARY KEY,   -- med_<uuidv7>
  r2_key      TEXT NOT NULL,
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

```

No content-versioning table (explicitly descoped — only schema history matters).
No FK enforcement / cascade on relations — app-level responsibility, deliberate.

## Schema validation (on every PATCH, before the mutation flow below)

Order: cheap structural checks first, expensive compile last — reject junk before paying compile cost.

1. Size/depth cap — e.g. max 50 properties, max nesting depth 3. Agent-facing API, no legitimate collection needs more; cheap DoS guard on the compile step itself.
2. Property key format — `^[a-zA-Z_][a-zA-Z0-9_]*$`. Keys get interpolated into `json_extract(data, '$.{key}')` in the Kysely filter layer; reject anything that'd be ambiguous or break as a JSON path before it ever reaches query time.
3. Reserved key check — block `id`, `collection_id`, `data`, `status`, `created_at`, `updated_at`, `schema_version_id` (fixed `content` columns).
4. `x-relation` target exists — if present, the referenced collection slug must currently exist.
5. Compile — `TypeCompiler.Compile(newSchema)` in a `try/catch`. This is the real validity check: same function that validates every future content write, so failure here means failure later, caught at definition time instead. Reject with the compiler's error on throw.

## Schema mutation flow

```
PATCH /collections/:slug/schema
  1. newSchema = current schema with proposed change applied
  2. classify: does the change remove a property key, or change an existing key's `type`?
     -> if yes and `force` not sent: reject with which properties triggered it
  3. diff = jsonDiff(currentSchema, newSchema)
  4. if diff empty -> no-op, return current version unchanged
  5. else -> insert new schema_versions row, point collections.current_schema_version_id + schema at it
```

- Bump on **any** detected diff — simplest correct rule given expected usage (schema finalized once, then stable). No need to classify diff types just to decide _whether_ to bump.
- `force: true` is a separate, always-on safety gate, independent of the bump logic:
  - Required for: **removed property key**, **changed `type`** on an existing key. These can silently corrupt or hide existing `content` rows (stale values failing to coerce, e.g. `"unlimited"` under a new `number` type).
  - Not required for: new property, `x-label` change, enum/options extended, `required` toggled. These are always safe — old rows read back `NULL` via `json_extract` for missing keys, which is the entire resolution mechanism, no migration step needed.
  - Checked **per property** in the diff, not per request — one PATCH adding a field and removing another needs `force` because of the removal.

## Resolution at read time

- Fetch collection schema once per request/batch (not joined per row).
- Cache compiled TypeBox validator by `(collection_id, schema_version_id)` — stale isolate cache self-heals since the key includes version id.
- Join to `schema_versions` only for the exception case: a row's `schema_version_id` differs from the collection's `current_schema_version_id` and historical context is needed.

## Validation

- `TypeCompiler.Compile(rawJsonSchemaObject)` — plain JSON Schema in, no builder.
- `additionalProperties: false` always.
- Structured error responses required: `{ field, constraint, expected, received }` per violation, mapped from `Value.Errors()` — agents self-correct from structured errors, not prose.

## Query layer (Kysely)

- Fully typed for everything structural: `collections`, `schema_versions`, `media`, fixed `content` columns (`collection_id`, `status`, timestamps, joins, pagination).
- Filtering inside `data` cannot be typed at compile time (shape is runtime-defined per collection) — raw `json_extract` SQL fragments via `sql` template, built conditionally with `.$dynamic()`:
  ```ts
  let q = db
    .selectFrom("content")
    .selectAll()
    .where("collection_id", "=", collectionId)
    .$dynamic();
  for (const [field, value] of Object.entries(filters)) {
    if (!schema.properties[field])
      throw new BadRequest(`Unknown field: ${field}`);
    q = q.where(sql<boolean>`json_extract(data, ${"$." + field})`, "=", value);
  }
  ```
- **Filter field names must be whitelisted against the collection's actual schema properties before use in the raw fragment** — genuine injection surface now that there's no DDL-time generated-column boundary.
- No dedicated query language for v1 — equality/comparison on whitelisted fields only.

## API

```
POST   /collections                          schema:admin
GET    /collections                          content:read
GET    /collections/:slug/schema              content:read
PATCH  /collections/:slug/schema              schema:admin   (force:true required for key removal / type change)
DELETE /collections/:slug                     schema:admin   (refuse if content exists, unless force)

GET    /collections/:slug/content              content:read   (?field=value, ?field[gt]=value — whitelisted fields only)
GET    /collections/:slug/content/:id           content:read
POST   /collections/:slug/content               content:write
POST   /collections/:slug/content:validate       content:write  (dry-run, no write)
PATCH  /collections/:slug/content/:id            content:write
DELETE /collections/:slug/content/:id            content:write

POST   /media                                    content:write  (R2 presigned upload — TODO, not fleshed out)
GET    /media/:id                                content:read


GET    /openapi.json                             content:read   (live-assembled, see below)
POST   /auth/keys                                (session auth) generate a JWT API key, Flaggly pattern
```

## OpenAPI

- OpenAPI 3.1 schema objects ARE JSON Schema 2020-12 — `collections.schema` drops into `components.schemas.{slug}` with zero conversion.
- Static paths (auth, media, param shapes) generated by Hono's OpenAPI tooling from route definitions.
- Dynamic paths/components (per-collection) assembled at request time by looping current `collections` rows — spec can't be fully static since collections are created at runtime.
- Cache the assembled doc, invalidate on any schema mutation (same cache-key-by-version pattern as the validator cache).

## Auth

- `hono/jwt` directly — `sign()`/`verify()`, no auth framework. `/auth/keys` generates a `jti` (uuidv7, same ID scheme as everything else), signs a JWT with it + scopes in the payload.
- No session storage, no built-in revocation — all hand-rolled now that Better Auth isn't in the stack for this. Middleware verifies signature + expiry only, by default.
- **Open question:** plain JWTs aren't revocable before expiry without a `jti` blocklist. Not built for v1. If needed later: a small `revoked_keys(jti, revoked_at)` table, checked in the auth middleware on each request.
- Scopes: `content:read`, `content:write`, `schema:admin`, embedded in the JWT payload. An agent doing content CRUD should not be able to touch schema.

## Client DX

- No shared client/monorepo — consumers are external (agents, other services), so typing is spec-driven, not code-shared.
- One codegen pass covers both route shapes and content shapes, since collection JSON Schemas are already embedded in the live OpenAPI doc under `components.schemas.{slug}`:

  ```bash
  npx openapi-typescript https://your-cms.workers.dev/openapi.json -o generated/cms-schema.ts
  ```

  ```ts
  import createClient from "openapi-fetch";
  import type { paths } from "./generated/cms-schema";

  const client = createClient<paths>({
    baseUrl: API_URL,
    headers: { Authorization: `Bearer ${token}` },
  });

  const { data, error } = await client.GET("/collections/{slug}/content", {
    params: { path: { slug: "products" } },
  });
  ```

- **Requirement on the OpenAPI assembly for this to produce named types (`Product`, `Event`) instead of generic ones:** each collection's schema must be registered under a stable `components.schemas.{slug}` key, and content endpoint request/response bodies must `$ref` that key rather than inlining the schema per-route.
- Output checked into git (not generated at build time), same pattern as Prisma/Payload/Supabase typegen.
- **Open question:** no CI staleness check yet (`openapi-typescript ... && git diff --exit-code`) — add once more than one person/agent can mutate schema without going through local dev.

## Code patterns

These rules are enforced in this codebase. Future work must follow them.

### neverthrow, not try/catch

- **No `try/catch` for control flow.** All fallible operations return `Result` / `ResultAsync` from `neverthrow`.
- Services use `safeTry(async function* () { ... })` and `yield*` other results.
- Routes call services, then `unwrapResult(result)` to throw the correct `AppHTTPException` or `DataLayerError`.
- The only place errors are thrown is inside `unwrapResult` or Hono validators.

### Error responses

- **Every error response must be JSON**, including 404s, validation failures, and unhandled exceptions. Never return plain text.
- Use `AppHTTPException` with a concrete `ErrorCodes` value; the global `onError` handler normalizes everything else to JSON.
- Add a `.notFound()` handler at the app level so unknown routes return a JSON 404 instead of Hono's default plain-text response.

### Data layer (DL) rules

DL methods are thin wrappers around Kysely queries. They return `ResultAsync<T, DataLayerError>` via `BaseDataLayer.passThroughError` and `fromPromise`.

- **No `.then(...)` for row mapping.** Transform the row shape inside the Kysely query itself.
- Alias columns in `.select([...])`:
  - `.select(["title_field as titleField"])`
  - `sql<T>`column`.as("alias")` for JSON/typed columns (e.g., `sql<Record<string, unknown>>`schema`.as("schema")`).
- Use `.returning([...])` on inserts/updates instead of manually stitching the response together after the query.
- Scalar extraction (e.g., `count(*)`) is typed with `sql<T>` or `eb.fn.countAll<T>().as("count")`; the service reads `row?.count ?? 0`. Do not `.then(row => Number(row.count))`.
- DL must not contain business rules (existence checks, authorization, force-gates). Those live in services.

### Type inference from schemas

- Define route input/output schemas with the TypeBox builder (`import { Type } from "typebox"`).
- Infer TS types from those schemas: `export type Foo = Type.Static<typeof fooSchema>`.
- Do not hand-write interfaces that duplicate the schema.
- Use the inferred types in `jsonValidator<T>`, `paramValidator<T>`, `queryValidator<T>`, and service signatures.

### Route structure

- Each route module exports:
  - `_schema.ts` — TypeBox schemas + inferred types.
  - `_openapi.ts` — static OpenAPI path/component definitions for this route.
  - `_service.<verb>.ts` — one service per mutating/reading operation, using `safeTry`.
  - `_route.ts` — Hono handlers that validate input and call `unwrapResult`.
- Validators live in `src/lib/validator.ts` and are typed with the inferred schema type.
- Write routers in Hono's chained style:
  ```ts
  export const collectionRouter = createRouter()
    .get("/", async (c) => { ... })
    .post("/", jsonValidator<CreateInput>(createInputSchema), async (c) => { ... })
    .get("/:id", paramValidator<Params>(paramsSchema), async (c) => { ... });
  ```
- Prefer chaining over separate `router.get(...)` / `router.post(...)` statements.

### OpenAPI colocation

- Static OpenAPI pieces live in `src/routes/<name>/_openapi.ts` next to the route they describe.
- `src/lib/openapi.ts` is only an **assembler**: it imports static route contributions, queries the DB for dynamic per-collection schemas, and merges them.
- Dynamic collection schemas go under `components.schemas.{slug}`.
- System schemas use the `__` prefix to avoid colliding with user-defined collection slugs.

## Testing strategy

Tests run with **Vitest** and **`@cloudflare/vitest-pool-workers`**. They execute in the Workers runtime with real D1 bindings, against the actual `worker.fetch()` handler. No mocked data layer, no unit tests for thin wrappers.

- `pnpm test` runs the suite.
- `pnpm generate-test-migrations` regenerates `test/generated-migrations.ts` from `src/lib/db/migrations/*.sql` after schema changes.
- `test/setup.ts` applies migrations once (`beforeAll`) and truncates all tables before each test (`beforeEach`).
- Use `fetchWorker()` / `createCollection()` / `createContent()` in `test/utils.ts` for common operations.

Add integration tests for real, complex behavior only: schema versioning, destructive change force-gates, content validation, partial content updates, `json_extract` filters, and collection delete guards. Avoid testing data-layer wrappers or validators in isolation.

When smoke testing manually, the `feedr-dev` herdr workspace runs at `http://localhost:3200`. Use `curl` to hit endpoints and verify both happy and error paths, then inspect state with follow-up requests.

## Explicitly cut (considered, deliberately not building)

- Generated/indexed columns, `x-indexed` keyword, per-collection SQLite views — cut for simplicity at current scale. `json_extract` filtering is a full scan of the collection's rows; fine at hundreds–low-thousands of rows per collection. Escape hatch if a specific collection's filtered list endpoint gets slow: selectively promote just that field back to a real generated column + index, on that collection only — not a redesign.
- Content versioning/history.
- Relation referential integrity (app-level, deliberate).
- Schema-mutation concurrency lock (Durable Object) — needed only once multiple humans/schema-editing agents can mutate the same collection's schema concurrently. Single-actor for now.
- Idempotency key TTL cleanup.
- JWT revocation (`revoked_keys` table) — add if a key ever needs to be killed before natural expiry.
- Idempotency keys on writes — cut as overkill for current volume. Existed to prevent duplicate rows from agent retries on ambiguous timeouts (agents retry mechanically on dropped connections, unlike humans who hesitate). Revisit if duplicate content rows start showing up in practice — that's the concrete signal it's needed.
