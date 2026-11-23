# Dataset records

One metadata JSON per dataset, filename = `<slug>.json`.

- Schema: [`schemas/dataset.schema.json`](../schemas/dataset.schema.json)
- Vocabulary: [`data/tags.json`](../tags.json)
- Validation: `pnpm validate:data`
- Never commit the actual dataset archive. Link to it externally.
- Covers live in `public/covers/<slug>.webp` (+ `-thumb.webp`).

The catalog starts empty. The first merged submission creates the first record here.
