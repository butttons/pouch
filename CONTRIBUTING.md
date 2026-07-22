# Contributing

Practical how-tos for working in this codebase. For domain context (ID scheme, schema philosophy, scopes, OAuth), read [AGENTS.md](./AGENTS.md) first — this file only covers how to do things.

## Setup

1. `pnpm install`
2. Copy `.dev.vars.example` to `.dev.vars` and fill in values.
3. `pnpm db:migrate` to set up the local D1 database.
4. `pnpm dev` — worker runs at `http://localhost:3200`.

Useful commands:

| Command            | Purpose                                             |
| ------------------ | --------------------------------------------------- |
| `pnpm dev`         | Local dev server (wrangler)                         |
| `pnpm test`        | Integration test suite                              |
| `pnpm type-check`  | `tsc` — must pass before committing                 |
| `pnpm check`       | Biome lint + format check                           |
| `pnpm format`      | Biome format write                                  |

## Repo layout

```
src/
  app.ts            # app pipeline: middleware, route mounting, error handling
  index.ts          # worker entrypoint, OAuth provider wiring
  deps.ts           # request-scoped dependencies (DataLayer, env, actor)
  utils.ts          # createRouter, HonoVariables
  middleware/       # auth (scopes, JWT), deps, rate-limit
  lib/              # shared, route-agnostic code
    data/           # DataLayer: thin Kysely wrappers, one file per table
    db/             # Drizzle schema, migrations, Kysely client/types
    openapi/        # OpenAPI assembly (index.ts) + shared helpers (helpers.ts)
    schema/         # JSON Schema validation, diffing, media/relation helpers
  routes/
    <group>/
      _route.ts     # router only: middleware + handler wiring
      _openapi.ts   # OpenAPI paths/schemas contributed by this route group
      _schema.ts    # TypeBox request/response schemas (types inferred from them)
      _service.*.ts # business logic, one file per operation
      _util.*.ts    # route-local helpers
      _types.ts     # route-local shared types
      _page.*.tsx   # JSX pages (OAuth consent flow only)
test/
  integration/      # one file per surface area
  utils.ts          # fetchWorker, token helpers
```

## Style rules

These are hard requirements, enforced in review:

- No emojis anywhere.
- `type` over `interface`.
- Booleans are prefixed with `is` or `has` (`isValid`, `hasError`).
- Functions take a single object parameter (`fn({ slug, schema })`), never positional params.
- No `any`. If truly unavoidable, add an inline comment explaining why.
- Use `neverthrow` for all fallible operations. No `try/catch` for control flow. Wrap throwing calls in `Result.fromThrowable` / `ResultAsync.fromPromise`.
- Every error response is JSON, including 404s and unhandled exceptions (handled centrally in `app.ts`).
- Define request/response shapes as TypeBox schemas and infer TS types via `Type.Static`. Never hand-write a type that duplicates a schema.

## File organization

- Keep files small (~200 lines). When a file grows past that or mixes concerns, split it into focused files colocated in a folder.
- Route folders use `_`-prefixed filenames (see layout above). `_route.ts` contains no business logic.
- `src/lib` subfolders use plain filenames with a barrel `index.ts` (`export * from ...`) so `@/lib/<name>` imports stay stable.
- Before writing a new helper, check whether it already exists. Reuse or extend — never duplicate.

## How to add an endpoint

1. **Schema** — add TypeBox schemas to the route group's `_schema.ts`. Infer the TS type from the schema.
2. **Service** — add `_service.<name>.ts`. Services take `(input, deps)` and return `ResultAsync<T, AppHTTPException | DataLayerError>`. All data access goes through `c.var.deps.DL` — never construct queries in services or routes.
3. **Route** — wire it in `_route.ts`:
   ```ts
   .post(
     "/",
     requireScopes("content:write"),
     jsonValidator<InputType>(inputSchema),
     async (c) => {
       const input = c.req.valid("json");
       const result = await doThing(input, c.var.deps);
       const value = unwrapResult(result); // throws AppHTTPException on err
       return c.json(value, 201);
     },
   )
   ```
4. **Scopes** — pick from the existing scope map (see AGENTS.md). Multiple scopes are ANDed. Content routes always require both `collection:read` and the matching content scope.
5. **OpenAPI** — add the operation to the route group's `_openapi.ts` using `withOperation(operation, scopes)` from `@/lib/openapi/helpers`. The scopes passed here must match the route's `requireScopes` exactly. Static groups export `paths`/`schemas` objects, which `src/lib/openapi/index.ts` already assembles — no changes needed there for existing groups.
6. **Mutation?** — make sure the data layer call writes an audit log entry (see below).
7. **Tests** — add integration tests (see below).

## How to change the database

The full sequence — every step is required:

1. Edit `src/lib/db/schema.ts` (Drizzle table definitions).
2. `pnpm db:generate` — generates a new Drizzle migration.
3. `pnpm db:migrate` — applies it to the local D1 database.
4. `pnpm db:codegen` — regenerates Kysely types (`src/lib/db/types.ts`).
5. `pnpm generate-test-migrations` — regenerates `test/generated-migrations.ts`.
6. `pnpm test` — verify nothing broke.

Then expose the new column/table through the matching data layer in `src/lib/data/` (thin Kysely wrappers only — no business rules).

## How to add a mutation (audit logging)

Audit is mandatory on every mutating data layer method (create, update, delete):

- Build the insert with `AuditLogDataLayer.createInsert(db, event)` inside the data layer method.
- The event needs an `action` from `AUDIT_LOG_ACTION` (`src/lib/audit-log.ts`) — add a new action string there if none fits.
- Services always pass an `AuditLogEvent` with `actor` from `deps.actor`.

## How to add or change a scope

1. Add the scope string to `SCOPES` in `src/middleware/auth.ts`.
2. Apply it via `requireScopes(...)` on the routes.
3. Add the same scope to the OpenAPI operations (`withOperation` call) — route scopes and `x-required-scopes` must stay in sync.
4. Update the scope table in `README.md` and the scope list in `AGENTS.md`.
5. The `scopes` enum in `src/routes/auth/_openapi.ts` (the `/auth/keys` request body) must include it too.

## Testing

- Integration tests only, run against the real `worker.fetch()` via `@cloudflare/vitest-pool-workers`. Use `fetchWorker` from `test/utils.ts`.
- No unit tests for thin data-layer wrappers or validators.
- Tests load `.dev.vars` — if you rename an env var or secret, update `.dev.vars` and `.dev.vars.example` together.
- After any DB schema change, regenerate `test/generated-migrations.ts` (see above) or the suite runs against a stale database.

## Commits and releases

- Commit messages follow Conventional Commits: `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`.
- Releases are tagged `vX.Y.Z` from `package.json` and published via `gh release create` with notes grouped by change type.
