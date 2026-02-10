---
name: x-writing-system-skill
description: Build a research-backed X writing system around a user draft. Use this skill when the user wants rewrite advice grounded in Matt Gray guidelines, their own top posts, topic winners, and trends. Then produce 5 LLM-authored post versions.
---

# X Writing System Skill

Use this skill when the user asks for:

- rewrite help for a draft post
- tactical writing feedback based on real X data
- a writing system that blends personal + market signals

## Workflow

1) Ensure env is available (`X_BEARER_TOKEN` minimum).

2) Run the research brief command:

```bash
bun run x-search.ts advise \
  --draft "<user draft>" \
  --username <username> \
  --performant-like-threshold 50 \
  --topic-search-attempts 3
```

Use `--draft-file` if needed.

3) Treat CLI output as evidence, then author the final answer with the model.

## Required behavior

- Always incorporate Matt Gray writing guidelines as baseline.
- Always include personal top posts (last 30 days) when available.
- Always include topic research samples with metrics.
- Always include closest trends overlap output.
- Always give 3 specific recommendations.
- Always produce 5 distinct improved post versions authored by the model.

Do not output static template versions as the final result.

## Final response format

Use this exact section order:

## Closest Trending Topics
- ...

## Topic Research (High-Performing Samples)
- Show concrete sample posts from topic research with metrics.
- Prefer >50 likes where available; if none qualify, show best available and say so explicitly.

## 3 Specific Recommendations
1) Recommendation grounded in market research sample(s) + guideline(s)
2) Recommendation grounded in personal top-performing post pattern(s)
3) Recommendation grounded in both (with specific edits to apply)

## 5 Improved X Post Versions
<!-- Must be LLM-authored, distinct, and viable standalone posts -->
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

## Guardrails

- Never print secret values.
- Never commit `.env`.
- Treat CLI output as evidence, not final copy.
- Keep the 5 versions concise, original, and aligned with the user voice.
