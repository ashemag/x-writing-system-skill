---
name: x-writing-system-skill
description: Analyze and improve draft X posts using a writing-system workflow: apply baseline writing guidelines, learn from top account posts in the last 30 days, research topic-specific top posts on X, and return research-backed suggestions plus 5 improved versions. Use when the user asks for post rewrites, hook optimization, thread guidance, or tactical writing feedback grounded in recent performance data.
---

# X Writing System

Use this skill to turn a draft post into a sharper version using:

- baseline writing-system guidelines,
- the user's own top-performing patterns,
- topic-specific market signals from X.

For API details and auth nuances, read `references/x-api.md`.

## Workflow

1. Ensure X credentials are available via env vars.
2. Pull posts from the last 30 days:
   - `python3 x-writing.py fetch --username <username> --out data/recent_posts.json`
3. Rank top account posts by:
   - impressions (primary)
   - likes (secondary)
   - reposts/replies/quotes (secondary)
4. Apply baseline writing-system rules:
   - strong hook
   - concrete specificity
   - consistent spacing and readability
   - punchy bar line
   - clear CTA
5. Extract topics from the draft (or use user-provided topics) and search X:
   - `GET /2/tweets/search/recent`
6. Rank topic posts by public engagement and extract learnings.
7. Compare the draft against account + topic patterns:
   - hook strength
   - specificity and examples
   - readability/spacing
   - CTA quality
8. Return targeted edits and:
   - learnings,
   - suggestions,
   - one primary rewritten draft,
   - 5 improved X post versions.

## Env Loading

The CLI loads env vars in this order (without overwriting already-set env vars):

1. `--env-file` paths (if provided),
2. `<repo>/.env`,
3. `../ashe_ai/.env`.

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

Advise with explicit topics:

```bash
python3 x-writing.py advise \
  --draft-file ./draft.txt \
  --username <username> \
  --topics "topic a,topic b,topic c"
```

## Output Format

```markdown
## Score Snapshot
- Hook Strength: X/10
- Specificity: X/10
- Shareability: X/10
- Clarity: X/10

## Writing System Guidelines Applied
- ...

## Personal Learnings (Last 30 Days)
- ...

## Topic Research Learnings
- ...

## Improvement Suggestions
- ...

## Rewritten Draft (Primary)
...

## 5 Improved X Post Versions
### Version 1
...
### Version 2
...
### Version 3
...
### Version 4
...
### Version 5
...
```

## Guardrails

- Never print secret values.
- Never write credentials to disk.
- Read credentials from env vars only.
