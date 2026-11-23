---
title: Getting started
description: Prepare, submit and publish a Minecraft dataset through the GitHub Issue Form.
order: 1
updated: 2026-11-22
---

# Getting started

A listing is one JSON file in [`data/datasets`](https://github.com/Kurisa-kuku/MINEWORLD-Datasets-site/tree/main/data/datasets) plus a cover image. You do not need write access to the repository: the submission flow runs through a GitHub Issue Form and an automated pull request.

## Before you start

You need:

- a GitHub account;
- a stable download link, or a contact link for request-based access;
- a title and a one-sentence description in English and Chinese;
- a license and the right to redistribute the data under it;
- a 16:9 cover (1280×720 recommended, 2 MB maximum); and
- honest notes about known limitations.

> A dataset does **not** have to be recorded with Mwarecorder. Replay files, raw video and ready-to-train custom datasets are welcome. Mwarecorder only offers the richest aligned streams.

## 1. Open the submission form

Use the **Submit** page and choose **Open the submission form**. The form is an official GitHub Issue Form with structured fields. It keeps the catalog queryable instead of relying on free-form issue text.

The form covers four blocks:

1. **Basic information** — bilingual title and short description, license, cover.
2. **Source & compatibility** — format, Mwarecorder versions, streams, environment.
3. **Scale & content** — episodes, total size, duration, task/dimension/training-use/quality tags.
4. **Access & compliance** — download links, access type, privacy answers.
5. **Usage notes** — how to load, recommended use, known limitations, optional examples.

## 2. Add the cover

The cover field accepts a URL, or a file dragged into the text field (GitHub will upload it and insert the URL).

- 16:9, ideally 1280×720.
- 2 MB maximum before processing.
- The workflow downloads the image, crops/fits it to 16:9, converts it to WebP, and generates a 640×360 thumbnail.
- If you omit a cover, the site selects one of four pixel-art defaults deterministically from your slug.

Do not upload artwork you do not have the right to use. Screenshots of your own world are ideal.

## 3. What the automation does

When the issue is opened or edited:

1. `issue-to-pr.yml` parses the structured form.
2. Fields are validated against `schemas/dataset.schema.json`.
3. The cover is converted to WebP and thumbnails are generated.
4. A new JSON file is added under `data/datasets/`.
5. A pull request is opened and linked back to the issue.

The workflow never commits directly to `main` and never merges itself.

## 4. Review

A maintainer reviews:

- license and redistribution rights;
- privacy disclosures;
- link health and access type;
- title/description quality and bilingual fallback;
- whether the data description matches the actual files.

You may be asked to edit the original issue. Re-running the workflow updates the generated branch and pull request. Once merged, the site rebuilds automatically.

## 5. After publishing

Your listing gets:

- a permanent `/en/datasets/<slug>/` and `/zh/datasets/<slug>/` page;
- URL-synced filters and search;
- GitHub reactions and Giscus comments;
- a correction flow that turns metadata edits into a pull request;
- a version history and optional deprecation/supersession relationship.

## Common rejection reasons

- A download link requires a private token or a Google Drive permission request.
- `License` says CC BY but the archive contains third-party mod assets without credit.
- Episode counts or duration are estimates not derived from the actual files.
- Known limitations say “none” while the recorder dropped frames or paused repeatedly.
- The cover is a stretched screenshot or an unlicensed logo.

If the review finds a small metadata error, a maintainer can ask you to use the [metadata editor](../corrections/) instead of resubmitting the whole form.
