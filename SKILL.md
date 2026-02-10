---
name: x-writing-system-skill
description: Analyze and improve draft X posts using account-specific performance signals from the last 30 days. Use when the user asks for tweet/post rewrites, stronger hooks, thread guidance, or suggestions based on top-performing content by impressions, likes, and reposts.
---

# X Writing System

Use this skill to turn a draft post into a sharper version using the user's own top-performing patterns.

For API details and auth nuances, read `references/x-api.md`.

## Workflow

1. Ensure X credentials are available via env vars.
2. Pull posts from the last 30 days:
   - `python3 x-writing.py fetch --username <username> --out data/recent_posts.json`
3. Rank top posts by:
   - impressions (primary)
   - likes (secondary)
   - reposts (secondary)
4. Compare the draft against top-post patterns:
   - hook strength
   - specificity and examples
   - readability/spacing
   - CTA quality
5. Return targeted edits and a rewritten draft.

## Command Reference

Fetch:

```bash
python3 x-writing.py fetch --username <username> --out data/recent_posts.json
```

Advise using existing post dataset:

```bash
python3 x-writing.py advise --draft "<draft text>" --posts data/recent_posts.json
```

Advise with auto-fetch:

```bash
python3 x-writing.py advise --draft-file ./draft.txt --username <username>
```

## Output Format

```markdown
## Score Snapshot
- Hook Strength: X/10
- Specificity: X/10
- Shareability: X/10
- Clarity: X/10

## What Works
- ...

## Improve Next
- ...

## Rewritten Draft
...

## Why These Changes
- Pattern observed in top posts: ...
- Applied to draft by: ...
```

## Guardrails

- Never print secret values.
- Never write credentials to disk.
- Read credentials from env vars only.
