# Contributing

Thank you for improving the Minecraft agent data commons. There are three ways to contribute:

- **Submit a dataset** through the site's Issue Form.
- **Correct a listing** with the metadata editor.
- **Improve the catalog** — schema, UI, docs, workflows — with a pull request.

Read the bilingual wiki in [`docs/`](docs/) first, especially:

- [Getting started](docs/en/getting-started.md)
- [Data contract](docs/en/data-format.md)
- [Corrections & lifecycle](docs/en/corrections.md)
- [Moderation](docs/en/moderation.md)

## Development setup

```bash
pnpm install
cp .env.example .env
pnpm dev
pnpm validate:data
pnpm build
```

Node.js 22+ and pnpm 11+ are required. Do not commit tokens or `.env` files.

## Submitting data

Do not open a free-form issue for a dataset. Use the structured form from `/en/submit/` or `/zh/submit/`. The automation parses it, validates the JSON, processes the cover and opens a pull request.

A dataset does **not** have to be recorded with Mwarecorder. Replay files, raw video and custom tensor datasets are welcome. Be honest about alignment, privacy and rights.

## Pull requests

- Keep one concern per pull request.
- Run `pnpm validate:data` and `pnpm build` before requesting review.
- New or changed dataset JSON must pass the JSON Schema and the tag vocabulary.
- Covers must be 16:9 and at most 2 MB after processing.
- Do not edit someone else's dataset metadata without a correction trail.
- Update docs if you change the schema, filters, tags or workflows.

## Code style

- TypeScript, no runtime framework beyond Astro and vanilla browser modules.
- Prefer CSS variables from `src/styles/global.css`; avoid one-off colours.
- Keep pixel design tokens consistent: 2px hard borders, hard shadows, no rounded corners.
- All user-facing strings must exist in both `en` and `zh` i18next resources.
- Use `Intl` for dates and numbers.
- Preserve keyboard accessibility and reduced-motion behaviour.
- Never inject untrusted issue or dataset content with `innerHTML`.

## Data ownership

By contributing a listing you confirm the metadata is accurate and you have the right to publish the linked data under its stated license. Contributors retain ownership of their datasets. The catalog license (MIT) covers the site code and metadata, not the dataset archives.

## Community standards

Be precise, credit people, and criticise data rather than contributors. Harassment, doxxing, license laundering and fabricated metadata are not tolerated. Report security or privacy concerns privately as described in [SECURITY.md](SECURITY.md).
