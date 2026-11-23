---
title: Data contract
description: The JSON schema, tag vocabulary, Mwarecorder stream layout and loading expectations.
order: 2
updated: 2026-11-22
---

# Data contract

The catalog stores metadata as JSON; it does not host the data itself. A listing should give a new user everything needed to decide whether a download is worth their time and how to load it.

The authoritative schema is [`schemas/dataset.schema.json`](https://github.com/Kurisa-kuku/MINEWORLD-Datasets-site/blob/main/schemas/dataset.schema.json). The schema is validated on every pull request and during every site build.

## Bilingual fields

Titles, summaries, usage notes and history notes are objects:

```json
{
  "title": {
    "en": "Skyblock Dawn — Builder Starter Pack",
    "zh": "空岛晨曦 · 建造入门数据集"
  }
}
```

At least one language must be present. If the active language is missing, the site falls back to the other one and displays a **“no translation in your language”** notice. Fields such as slug, license, format and tags use controlled slugs instead of free text.

## Tag vocabulary

[`data/tags.json`](https://github.com/Kurisa-kuku/MINEWORLD-Datasets-site/blob/main/data/tags.json) is the source of truth for:

- formats, environments, verification status and streams;
- tasks, dimensions, training uses and quality annotations;
- licenses, access types, link types and contributor roles.

Tags are stored as slugs and displayed through bilingual names. This avoids the usual synonym soup (`imitation learning`, `imitation-learning`, `IL`, …) and keeps URL filters stable.

## Mwarecorder layout

For a Mwarecorder format 2.0 episode:

```text
episode_YYYYMMDD_HHMMSS/
  metadata.json
  state.jsonl
  action.jsonl
  event.jsonl
  frames.jsonl
  frames/
    frame_000001.jpg
    ...
  summary.json
```

All records share `sample_tick`. A training sample at tick `t` can use the frame mapped by `frames.jsonl`, the state at `t`, the action at `t` and the events carrying the same tick.

The standard converter writes `observations.npy`, `actions.npy`, `dones.npy`, `sample_ticks.npy` and alignment metadata. The verifier checks structure, alignment, dimension transitions, frame existence and summary counters. Record the verifier result in the listing under **verification** and mention any exceptions under **limitations**.

## Formats other than Mwarecorder

| Format | What to link | What to document |
| --- | --- | --- |
| Replay / demo | `.mcpr` or a render archive | Minecraft/ReplayMod versions, extraction method |
| Raw video | MP4/MKV or frame archive | Resolution, FPS, HUD/crops, lack of action labels |
| Custom dataset | HDF5, NPZ, Parquet, WebDataset, … | Schema, split files, channels, alignment assumptions |

For custom formats, include a short loader example in **How to load**. That is often the difference between a useful dataset and an unused one.

## Access and compliance

Use exactly one access type:

- **Open download** — public links; the license must clearly permit reuse.
- **Request access** — a request link or contact; do not link to a private token.
- **Restricted** — preview only, or access under specific conditions.

Answer the three privacy/rights questions honestly:

1. Does the data contain personal player data (names, chat, skins, account identifiers)?
2. Does it include third-party content (maps, mods, music, other people’s builds)?
3. Do you have the right to redistribute it?

The third answer must be `true` for an open download. If it is not, use request/restricted access.

## Versioning, deprecation and replacement

The `history` array records releases and corrections. When a dataset is superseded:

```json
"deprecation": {
  "status": "superseded",
  "replacedBy": "the-new-dataset-slug",
  "note": {
    "en": "Use the new verified version instead.",
    "zh": "请使用新的已校验版本。"
  }
}
```

The site shows a banner and a direct link to the replacement. Deprecated records stay available for reproducibility but are sorted out of featured placements.

## Size and date formatting

`scale.bytes` is a byte count and `scale.durationSeconds` is a duration in seconds. The UI formats both with `Intl.NumberFormat`. Store real values, not preformatted strings such as “~30 GB”. Dates use `YYYY-MM-DD`.

## Validation locally

```bash
pnpm validate:data
pnpm build
```

The first command checks the JSON schema, tag vocabulary, cover dimensions, 2 MB limit and deprecated references. The second also runs `astro check` before generating the site.
