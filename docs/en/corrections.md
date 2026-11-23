---
title: Corrections & lifecycle
description: How to fix metadata, submit a correction, and retire or replace a dataset.
order: 3
updated: 2026-11-22
---

# Corrections & lifecycle

Data outlives its first description. A license changes, an archive is re-indexed, a mirror dies, or a newer recording supersedes an old one. The catalog treats metadata as versioned source code.

## Use the metadata editor

Open any dataset and choose **Edit metadata**, or go to `/en/edit/` / `/zh/edit/`. The editor lets a contributor propose changes to:

- bilingual titles and summaries;
- license, format and compatibility fields;
- streams, environment and verification status;
- episodes, total size and duration;
- tasks, dimensions, training uses and quality badges;
- access type, download links and privacy answers;
- bilingual usage notes and examples.

The editor deliberately **does not** change the slug, cover, contributor list or version history. Those are reviewed with the data itself. Mention any cover or credit changes in the correction note.

## What happens when you submit

The editor:

1. Builds a full corrected JSON document locally.
2. Creates an issue titled `[Correction] …` with the JSON inside a machine-readable marker.
3. Leaves a change note for reviewers.

The issue-to-PR workflow detects the correction marker, validates the JSON, writes the updated file, adds a changelog entry and opens a pull request. A maintainer then checks the diff.

Nothing changes on the live site until that pull request is merged and the deploy completes.

## Changelog rules

Each release that changes the actual archive should add a `history` entry with a date, optional version and bilingual note. Metadata-only corrections also add a history entry; the automation writes a generic note and includes the issue link where possible.

Corrections must not rewrite history. To remove an old version, mark it deprecated rather than deleting its record.

## Supersede a dataset

When a new dataset replaces an old one:

1. publish the new listing;
2. edit the old listing;
3. set `deprecation.status` to `superseded`;
4. set `deprecation.replacedBy` to the new slug;
5. explain the change in `deprecation.note` and add a history entry.

The old URL stays valid and shows a banner linking to the new dataset. This is important for papers and training logs that cite the original listing.

Use `deprecated` without a replacement when a dataset is withdrawn for compliance or quality reasons. The record is still visible so that removed data cannot silently be mistaken for valid data.

## Reporting instead of correcting

If the issue is not a simple metadata edit — a broken link, a license violation or a privacy concern — use **Report a problem** rather than the editor. Reports go to the moderation queue and stay public. Never paste private personal data into a report; describe the concern and a maintainer will follow up privately if needed.

## Who can submit a correction?

Anyone with a GitHub account. You do not need repository write access. The automation opens a pull request on your behalf, and maintainers review it. Corrections from the original uploader are labelled as such automatically by GitHub authorship.
