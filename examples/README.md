# Examples

Runnable examples of consuming a pouch instance. Each is self-contained with its own dependencies and setup notes (see the AGENTS.md in each folder).

- [`consumer-worker`](./consumer-worker) — call pouch from a Cloudflare Worker over a service binding (no public network hop), with a fully typed client.
- [`caching-worker`](./caching-worker) — cache pouch responses in a Worker with the Cache API, with tag-based purging on mutations via the zone purge API.
- [`astro-blog`](./astro-blog) — use pouch as the content source for a static Astro site, fetched and typed at build time.

All three share the same type-generation flow: `npm run generate-types` pulls the live OpenAPI spec from a pouch instance and regenerates the typed client (see each example for which env file it sources).
