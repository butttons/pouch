# consumer-worker

Minimal example of calling pouch from a Cloudflare Worker over a service binding (no public network hop).

- Service binding `POUCH` in `wrangler.jsonc` points at the `pouch-cms` worker. Keep it in sync with the `name` in pouch's own `wrangler.jsonc`.
- `npm run generate-types` regenerates `src/generated/pouch.ts` from the live pouch OpenAPI spec. It sources `.dev.vars`, which must contain `POUCH_URL` and `POUCH_TOKEN`.
- `npm run cf-typegen` regenerates `worker-configuration.d.ts` (the `Env` type) after changing `wrangler.jsonc` or `.dev.vars`.
- `.dev.vars` is also what wrangler loads at runtime, so the same token is used for codegen and for the worker's requests.
- Run locally with `npm run dev` while the pouch dev server is running; wrangler connects the binding to the local pouch process automatically.
