# astro-blog

Minimal example of using pouch as the content source for an Astro site.

- Content is fetched at build time in the page frontmatter (`src/pages/index.astro`) via the typed client in `src/lib/pouch.ts`.
- `npm run generate-types` regenerates `src/generated/pouch.ts` from the live pouch OpenAPI spec. It sources `.env`, which must contain `POUCH_URL` and `POUCH_TOKEN`.
- `.env` is also what Astro loads via `import.meta.env`, so the same values drive codegen and the build.
- The pouch list endpoint returns content in every status; filter to `status === "published"` in the frontmatter for a public site.
