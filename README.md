# x-writing-system-skill

X writing system skill for Codex-style agents. It now runs a 4-step workflow:

1. Apply generic writing-system guidelines.
2. Pull and analyze your top-performing posts from the last 30 days.
3. Research your draft topics on X and mine top public posts for learnings.
4. Return learnings + suggestions + 5 improved X post versions.

Inspired by the structure and workflow style of [`rohunvora/x-research-skill`](https://github.com/rohunvora/x-research-skill).

## What it does

- Fetches owned-account posts from the last 30 days.
- Uses user-context auth to access non-public metrics (impressions) when available.
- Ranks owned posts primarily by impressions, then engagement.
- Extracts style patterns from your top performers.
- Extracts topics from your draft and searches X for topic examples.
- Ranks topic examples by public engagement to infer transferable patterns.
- Produces:
  - writing-system learnings,
  - improvement suggestions,
  - one primary rewrite,
  - five improved post versions.

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

Use environment variables:

- `X_API_KEY`
- `X_API_KEY_SECRET`
- `X_ACCESS_TOKEN`
- `X_ACCESS_TOKEN_SECRET`
- `X_BEARER_TOKEN` (fallback for public metrics only)
- `X_USERNAME` or `X_USER_ID`

Env bootstrap behavior:

- The CLI auto-loads `.env` in this repo if present.
- It also auto-loads `../ashe_ai/.env` (without overriding already-set env vars).
- You can add extra files with `--env-file <path>` (repeatable).

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

Override topics and include topic search:

```bash
python3 x-writing.py advise \
  --draft-file ./draft.txt \
  --username ashebytes \
  --topics "creator economy,writing systems,x growth" \
  --topic-max-results 30
```

Skip topic research:

```bash
python3 x-writing.py advise \
  --draft-file ./draft.txt \
  --username ashebytes \
  --no-topic-research
```

## Notes

- X non-public metrics (including impressions) are only available for eligible owned/authorized posts and are most reliable in recent windows.
- Topic research uses the X recent search endpoint and ranks by public engagement.
- This project is read-only: it does not publish or modify posts.
