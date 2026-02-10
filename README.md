# x-writing-system-skill

X writing system skill for Codex-style agents. It pulls your recent posts (last 30 days), ranks top performers by impressions/likes/reposts, and generates concrete rewrite suggestions for a draft post.

Inspired by the structure and workflow style of [`rohunvora/x-research-skill`](https://github.com/rohunvora/x-research-skill).

## What it does

- Fetches owned-account posts from the last 30 days
- Uses user-context auth to access non-public metrics (impressions) when available
- Ranks posts by impressions, likes, and reposts
- Extracts style patterns from top performers
- Produces actionable edits + rewritten draft

## Repo Structure

```text
x-writing-system-skill/
├── SKILL.md
├── x-writing.py
├── lib/
│   ├── api.py
│   └── analyze.py
├── references/
│   └── x-api.md
└── data/
    └── cache/
```

## Setup

Use environment variables (recommended):

- `X_API_KEY`
- `X_API_KEY_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`
- `X_BEARER_TOKEN` (fallback for public metrics only)
- `X_USERNAME` or `X_USER_ID`

## Usage

Fetch posts (last 30 days by default):

```bash
python3 x-writing.py fetch --username ashebytes --out data/recent_posts.json
```

Print computed start time only:

```bash
python3 x-writing.py fetch --print-start-time
```

Generate suggestions from a draft:

```bash
python3 x-writing.py advise \
  --draft "your draft post text here" \
  --posts data/recent_posts.json
```

Or fetch + advise in one command:

```bash
python3 x-writing.py advise \
  --draft-file ./draft.txt \
  --username ashebytes
```

## Notes

- X non-public metrics (including impressions) are only available for eligible owned/authorized posts and are most reliable in recent windows.
- This project is read-only: it does not publish or modify posts.
