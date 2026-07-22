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
- `aud_` — audit log entries

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

Both the request validator in `src/routes/content/_service.get.ts` and the OpenAPI generator in `src/routes/content/_openapi.ts` must derive allowed operators from the same mapping in `src/lib/query-filter.ts`.

## Schema philosophy

- `collections.schema` is standard JSON Schema, stored as-is.
- Property keys are immutable. Renaming a label is not the same as removing and re-adding a key.
- No EAV, no table-per-collection, no views. The shared `content` table shape is fixed.

## Scopes and per-collection keys

- Seven scopes, one read/write pair per endpoint group plus a read-only audit scope: `collection:read|write` (`/collections`), `content:read|write` (`/collections/:slug/content`), `media:read|write` (`/media`), `audit:read` (`/audit-logs`). `schema:admin` no longer exists. `GET /openapi.json` requires `collection:read`.
- Content routes require both `collection:read` and the matching content scope — `requireScopes("collection:read", "content:read")` etc. Multiple scopes on a route are ANDed.
- JWTs may carry a `collections` claim (array of slugs, set via `/auth/keys`) confining the key to those collections. `requireCollectionAccess()` middleware enforces it on every route with a `:slug` param (content, schema, delete); `GET /collections` filters its result instead of 403ing. Media and audit-log routes ignore the claim. Absent claim = all collections.
- The MCP `tools/list` applies the same restriction: tools bound to a concrete collection slug outside the claim are hidden, while parameterized tools (`get_collection_by_slug`, `list_collections`, …) stay visible and rely on execution-time enforcement.
- `/auth/keys` requires `name` and `scopes` (both mandatory); `collections` is optional. OAuth consent grants carry scopes but no `collections` claim.
- Route scopes and the OpenAPI `x-required-scopes` values must stay in sync — both derive from the mapping above.

## Code patterns

- Use `neverthrow` for all fallible operations. No `try/catch` for control flow.
- Every error response must be JSON, including 404s and unhandled exceptions.
- Request pipeline order in `src/app.ts`: `contextStorage` → `depsMiddleware` → `rateLimitMiddleware` → routes. The rate limiter uses the Cloudflare `RATE_LIMITER` binding, keyed on the token's `jti` when a JWT is present, falling back to `cf-connecting-ip`.
- Data layer methods are thin Kysely wrappers. Business rules live in services.
- `DataLayer` is a class with public sub-layer properties (`auditLog`, `collection`, `content`, `contentIndex`, `media`). Instantiate it with `new DataLayer({ db, batch })` — do not use a factory function.
- Audit log inserts are built via `AuditLogDataLayer.createInsert(db, event)` static method. Other data layers import this from `./audit-log` sibling module, not from `@/lib/audit-log`.
- Audit is required on all mutating data layer methods (create, update, delete). Callers in services always pass an `AuditLogEvent`.
- Define route schemas with TypeBox and infer TS types from them. Do not hand-write interfaces that duplicate the schema.
- Colocate OpenAPI pieces with routes (`_openapi.ts`), including per-collection dynamic builders (`src/routes/content/_openapi.ts`). `src/lib/openapi/index.ts` only assembles.

## File organization

- Keep files small. When a file grows past ~200 lines or mixes concerns, split it into focused files colocated in a folder.
- Route folders use `_`-prefixed files: `_route.ts` (router only), `_openapi.ts`, `_schema.ts`, `_service.*.ts`, `_util.*.ts`, `_types.ts`, `_page.*.tsx`.
- `src/lib` subfolders (`data/`, `db/`, `openapi/`, `schema/`) use plain filenames with a barrel `index.ts` (`export * from ...`) so `@/lib/<name>` imports stay stable.

For contributor-facing how-tos (adding routes, scopes, DB changes), see [CONTRIBUTING.md](./CONTRIBUTING.md).

## OAuth for MCP

- OAuth clients self-register via RFC 7591 DCR at `POST /register` (enabled via `clientRegistrationEndpoint` in `src/lib/oauth.ts`), stored in `OAUTH_KV` by the library. There is no operator-managed client registry.
- DCR-registered clients expire after the library default of 90 days; clients are expected to re-register.
- Clients are public (PKCE-only, `tokenEndpointAuthMethod: "none"`). Never issue client secrets.
- Client lookups outside the provider wrapper (e.g. the consent flow) use `getOAuthHelpers(env).lookupClient(clientId)` from `src/lib/oauth.ts` — there is no data layer for OAuth clients.
- The consent flow (`GET/POST /authorize`) lives in `src/routes/oauth/` and renders JSX pages via `hono/jsx`. Human-facing pages use the shared `Layout` from `src/routes/oauth/Layout.tsx` — fully self-contained, styles inlined, no static assets.
- The consent flow router is mounted by the `OAuthProvider` defaultHandler in `src/index.ts`, outside the main app pipeline, so it applies `depsMiddleware` and `rateLimitMiddleware` itself.
- Plain pouch JWTs remain valid on `/mcp` via the `resolveExternalToken` callback in `src/lib/oauth.ts`. OAuth-issued and JWT-issued requests both reach tool handlers as `executionCtx.props.accessToken` — tool dispatch must read props before the incoming `Authorization` header.
- Multi-value form fields (e.g. scope checkboxes) must be read with `formData.getAll()` — Hono's `parseBody()` keeps only the last repeated key.

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
