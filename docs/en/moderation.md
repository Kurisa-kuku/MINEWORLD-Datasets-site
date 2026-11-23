---
title: Moderation
description: The control room, issue queues, link health checks and maintainer permissions.
order: 4
updated: 2026-11-22
---

# Moderation

The moderation tool is a static page that talks directly to the GitHub API. There is no separate database and no server-side session. A maintainer signs in with GitHub; writes are performed with the maintainer’s token and are visible in the repository audit trail.

Open **Control room** from the account menu or go to `/en/admin/` / `/zh/admin/`.

## Who counts as a maintainer?

The UI calls `GET /repos/{owner}/{repo}` and shows moderation controls only if the token has `push`, `maintain` or `admin` permission. The GitHub API itself enforces this on every write. Listing someone in `PUBLIC_ADMIN_LOGINS` does not grant permission; it only affects labels and hints.

If the repository belongs to an organisation, members of a team with write access can moderate. A pull request can be merged from the control room, but a review is still expected.

## Queues

| Tab | Labels | Purpose |
| --- | --- | --- |
| Reports | `dataset-report`, `report` | broken links, wrong metadata, license or privacy concerns |
| Corrections | `dataset-correction` | structured metadata corrections |
| Data health | `link-health`, `data-error` | automated reachability and schema alerts |
| Pull requests | any open PR | dataset submissions, corrections and cover processing |

Cards show the issue title, author, timestamp and labels. Maintainers can comment, close/reopen issues and squash-merge pull requests. Non-maintainers can read the public queue but cannot write.

## Link health

The scheduled `link-health.yml` workflow checks every URL in `access.links` and `usage.examples`.

- It uses a HEAD/GET request with a timeout and a browser-like user agent.
- Persistent DNS failures, 4xx and 5xx responses are reported.
- GitHub API and some hosts block automated checks; these are marked “manual check” rather than failed.
- When a link fails, a `link-health` issue is opened or updated, and the affected slug is listed.
- Duplicate alerts are collapsed into one open issue.

The workflow does not automatically delete listings. A dead mirror may still have another working download; a maintainer decides.

## Review checklist

- Does the license actually cover all files in the archive?
- Is `redistributionPermitted` consistent with the access type?
- Does the cover have the right to be displayed?
- Are version, episodes, size and duration plausible?
- Are known limitations specific and honest?
- Does the download link work without private credentials?
- Does the JSON validate?
- Are all three privacy answers present?

## Reactions and comments

Each published dataset receives a GitHub issue used for reactions. The scheduled community workflow snapshots reaction and comment counts into `data/community/stats.json`, which is displayed statically. Authenticated users can add or remove a real 👍 reaction from the dataset page; signed-out users are sent to GitHub to react.

Comments use Giscus and GitHub Discussions. Giscus must be configured by the site maintainer through the repository variables documented in `.env.example`. Until then the page shows a fallback link to Discussions.

## Moderation principles

1. **Data stays with its authors.** The catalog is a signpost, not a rehosting platform.
2. **No silent deletion.** Use deprecation and history instead.
3. **Privacy beats convenience.** If consent is unclear, restrict access.
4. **Credit is not optional.** Third-party maps, mods and builds need attribution.
5. **Automation proposes; humans merge.**
