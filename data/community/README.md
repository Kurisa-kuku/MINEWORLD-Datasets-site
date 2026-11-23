# Community snapshot

`stats.json` is generated/updated by `.github/workflows/community-sync.yml`.

Each key is a dataset slug:

```json
{
  "slug": {
    "issueNumber": 42,
    "likes": 17,
    "comments": 4,
    "updatedAt": "2026-11-22T04:41:00.000Z"
  }
}
```

- `likes` counts GitHub 👍 reactions on the dataset's `[Reactions]` issue.
- `comments` counts comments on that issue.
- Comments embedded on the page use Giscus; the issue is the canonical reaction target.
