# Dataset schema

`dataset.schema.json` is the authoritative contract for every listing. It is used by:

- `scripts/validate-data.mjs` (local + CI)
- `scripts/issue-to-pr.mjs` before opening a pull request
- the Astro data loader at build time

The public URL is `/schemas/dataset.schema.json` (plus the site base path).

Requirements that cannot be expressed in JSON Schema (tag vocabulary membership, cover file existence, deprecation target references, 2 MB limit, 16:9 ratio) are enforced in `scripts/validate-data.mjs` and the automation.

When changing the schema:

1. update `src/lib/types.ts`;
2. update the issue forms and `scripts/issue-to-pr.mjs` if a field is user-supplied;
3. update the metadata editor and i18n resources;
4. migrate existing records;
5. run `pnpm validate:data && pnpm build`;
6. update the wiki.
