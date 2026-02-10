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

Required:

- `X_BEARER_TOKEN`
- `X_AUTH_MODE=bearer`

Env loading behavior:

1. `--env-file` (if provided)
2. `<repo>/.env`
3. `~/.config/env/global.env` (only if token still missing)

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

### Optional: pass topics explicitly

```bash
bun run x-search.ts advise \
  --draft-file ./draft.txt \
  --username ashebytes \
  --topics "agent skills,x api,writing systems" \
  --performant-like-threshold 50 \
  --topic-search-attempts 3
```

### Save markdown output

```bash
bun run x-search.ts advise --draft-file ./draft.txt --username ashebytes --save
```

## Command behavior

- `fetch`: pulls your account posts in the selected window.
- `research`: adaptive X topic search that broadens terms across attempts until it finds strong samples (or exhausts attempts).
- `advise`: merges draft + Matt Gray guideline baseline + personal winners + topic winners + trends overlap into a markdown research brief.

Quick mode (`--quick`) uses smaller pulls and longer cache TTL for cheaper iteration.

## Output contract

`advise` outputs:

- Closest trending topics
- Topic research sample posts (with likes/reposts/replies)
- Top personal posts from the last 30 days (with impressions + engagement)
- 3 specific recommendations
- LLM writing task to produce 5 final versions dynamically

## Full system power

This skill is designed to run as a data + reasoning system, not a simple template generator:

- **Personal calibration:** learns from your real winners in the last 30 days.
- **Market calibration:** runs adaptive topic research to find high-signal examples on X.
- **Trend awareness:** checks closest live trend overlap for timing/context.
- **Cost-aware operation:** caches results and supports quick mode.
- **LLM-native output:** final 5 versions are authored by the model from evidence, not hardcoded templates.

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

## Rate limits

The X API enforces per-endpoint rate limits on 15-minute rolling windows. The endpoints this skill hits most are:

| Endpoint | App (Bearer) | Per 15 min |
|---|---|---|
| Recent search | 450 requests | 10–100 results per request, 512-char query max |
| User tweet timeline | 10,000 requests | — |
| User lookup | 300 requests | — |

Every response includes three headers you can use to stay ahead of throttling:

- `x-rate-limit-limit` — max requests allowed in the current window
- `x-rate-limit-remaining` — requests left before you hit the wall
- `x-rate-limit-reset` — Unix timestamp when the window resets

If you exceed the limit the API returns **HTTP 429** (error code 88). The recommended recovery strategies from X's own docs:

1. **Cache aggressively** — store responses locally to avoid redundant calls (this skill already does this via `data/cache/`).
2. **Exponential backoff** — double the wait time with each retry after a 429.
3. **Monitor headers** — check `x-rate-limit-remaining` before firing the next request, not after.
4. **Prefer streaming over polling** — where applicable, use filtered stream endpoints instead of repeated search calls.

In practice: use `--quick` mode during iteration (smaller pulls, longer cache TTL), and save full `advise` runs for when you actually need fresh data. If you're running the CLI in a loop or from a scheduled job, space your calls to stay well inside the 15-minute window.

## Notes

- Read-only skill: it never posts to X.
- Recent search endpoint is used for topic research.
- File cache is in `data/cache/`.
- Keep `.env` local and never commit secrets.
