---
title: FAQ
description: Answers to the questions that come up most often.
order: 6
updated: 2026-11-22
---

# FAQ

## Do I have to use Mwarecorder?

No. The catalog accepts replays, raw video and custom tensor datasets. Choose the matching format and document how to load it. Mwarecorder just gives the strongest default alignment between video, state, action and events.

## Does this site host my data?

No. Upload the archive somewhere stable and submit a link. GitHub hosts the listing metadata and the cover; the data stays under your control.

## Is my GitHub login stored on a server?

No. The site is static. With browser OAuth device flow or the personal access token fallback, the token is kept in `sessionStorage` and sent only to `api.github.com`. Closing the tab clears it.

## Why can’t I merge my own submission?

Submissions and corrections become pull requests. A maintainer checks license, privacy and link health before merging. This is intentional. It is not a judgment of your work.

## Can I submit an anonymous dataset?

Use request-based access and describe the constraints. Do not impersonate someone else. Every issue and pull request is public, so the uploading GitHub account is visible; use an account you are comfortable attaching to the listing.

## The download is a Google Drive folder. Is that okay?

It can be, if it is publicly accessible without a request. For a folder that requires access, choose **request access** and provide a contact route. Avoid expiring links. A stable object-storage or archive URL is better.

## What does “verified” mean?

For Mwarecorder data it means the episode structure and tick alignment passed the official verifier. It does not mean the content is unbiased, legally clean or useful. Read the verification status together with quality tags and limitations.

## Why is there a “no translation” notice?

Bilingual fields allow one language to be missing so that a listing can still be published. The site falls back to the available language and tells you. If you can improve a translation, open a correction.

## How do I update my dataset after publishing?

Use the metadata editor, or open a correction issue. The automation validates the change and opens a PR. Add a history entry for substantive changes. Never silently replace files behind a link; use a new version and note it.

## A download link broke. What should I do?

Use **Report a problem** or open an issue. The scheduled link-health workflow also checks URLs and flags persistent failures. A maintainer may ask for a replacement or mark the listing restricted.

## Can I list a dataset that is not licensed for redistribution?

Only with clear restrictions: use **restricted** or **request access**, state the rights situation, and do not provide an open download. If you do not have the right to share it at all, do not submit it.

## How are likes counted?

A real GitHub 👍 reaction on the dataset’s community issue. Counts are snapshotted by a scheduled workflow. The site does not use hidden tracking or analytics.
