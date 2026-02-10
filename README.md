# x-writing-system-skill

X writing-system skill for Codex, Claude Code, and OpenClaw, modeled after the hybrid structure used in [`rohunvora/x-research-skill`](https://github.com/rohunvora/x-research-skill).

This repo pairs:

- `SKILL.md` (agent instructions + workflow)
- `x-search.ts` (Bun CLI for X data collection)
- `lib/*` (API, cache, analysis, formatting, types)

## What this skill does

Given a draft post, it builds a research brief in four parts:

1. Applies Matt Gray writing guidelines as baseline constraints.
2. Pulls your best-performing posts from the last 30 days.
3. Runs adaptive topic research on X to gather high-performing samples.
4. Adds trends overlap + 3 recommendations, then hands off to the LLM to author 5 improved post versions.

The CLI provides evidence. The final post versions are authored by the LLM (not static templates).

## Setup

### 1) Install Bun and dependencies

```bash
bun install
```

### 2) Add credentials

```bash
cp .env.example .env
```

Minimum required:

- `X_BEARER_TOKEN`

Optional:

- `X_USERNAME` or `X_USER_ID` (can also be passed via flags)
- OAuth1 keys if you want OAuth1 mode

Env loading behavior:

1. `--env-file` (if provided)
2. `<repo>/.env`
3. Bearer fallback: `~/.config/env/global.env` (only if token still missing)

Existing process env vars are never overwritten.

## CLI usage

### Fetch your recent posts

```bash
bun run x-search.ts fetch --username ashebytes --max-results 100 --out data/recent_posts.json
```

### Topic research only

```bash
bun run x-search.ts research --topics "agent skills,x api,writing systems" --topic-max-results 40
```

### Full writing-system research brief

```bash
bun run x-search.ts advise \
  --draft-file ./draft.txt \
  --username ashebytes \
  --performant-like-threshold 50 \
  --topic-search-attempts 3
```

### Save markdown output

```bash
bun run x-search.ts advise --draft-file ./draft.txt --username ashebytes --save
```

## Command behavior

- `fetch`: pulls your account posts in the selected window.
- `research`: adaptive X topic search (combined query by default to reduce API calls).
- `advise`: merges draft + personal winners + topic winners + trends into a markdown research brief.

Quick mode (`--quick`) uses smaller pulls and longer cache TTL for cheaper iteration.

## Output contract

`advise` outputs:

- Closest trending topics
- Topic research sample posts (with metrics)
- Top personal posts (with metrics)
- 3 specific recommendations
- LLM writing task to produce 5 final versions dynamically

## Project layout

```text
x-writing-system-skill/
├── SKILL.md
├── x-search.ts
├── lib/
│   ├── analyze.ts
│   ├── api.ts
│   ├── cache.ts
│   ├── env.ts
│   ├── format.ts
│   ├── guidelines.ts
│   └── types.ts
├── references/
│   └── x-api.md
└── data/
    └── cache/
```

## Notes

- Read-only skill: it never posts to X.
- Recent search endpoint is used for topic research.
- File cache is in `data/cache/`.
- Keep `.env` local and never commit secrets.
