# caching-worker

Example of caching pouch responses client-side in a Cloudflare Worker using the Cache API (`caches.default`), with tag-based invalidation on mutations.

- Same service-binding setup as `consumer-worker`; the difference is the custom `fetch` wrapper in `src/index.ts`.
- GET responses are cached for 1 week (`s-maxage`). That TTL is a backstop — entries are expected to be invalidated by purge, not expiry.
- Every cached entry is stamped with `Cache-Tag`: `col-<slug>` for the collection, `con-<id>` for single-item responses, and `col-<target>` for every collection embedded via `resolve=` (see `RESOLVE_TARGETS`, which mirrors the pouch schemas' `x-relation` fields).
- Non-GET requests pass through uncached. After a successful mutation, the worker purges the affected `col-<slug>` tag via the Cloudflare zone purge API (`POST /zones/{zone}/purge_cache`).
- Purging requires the worker to run on a custom domain in the zone, plus `CF_ZONE_ID` and `CF_API_TOKEN` (cache purge permission) in `.dev.vars`/secrets. Without them the purge is skipped with a log line — this is the expected state when running locally, since `wrangler dev` cannot exercise the purge API.
- `npm run generate-types` regenerates `src/generated/pouch.ts` (sources `.dev.vars`). `npm run cf-typegen` regenerates `worker-configuration.d.ts` after changing `wrangler.jsonc` or `.dev.vars`.
- Test endpoints: `GET /` (cached list), `GET /articles/:id` (cached item), `POST /touch` (bumps an article's `views`, triggering the purge path).
