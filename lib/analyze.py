from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List


@dataclass
class ScoredPost:
    text: str
    impressions: int
    likes: int
    reposts: int
    score: float


def _metrics(post: Dict) -> Dict:
    public_metrics = post.get("public_metrics", {}) or {}
    non_public = post.get("non_public_metrics", {}) or {}
    return {
        "impressions": int(non_public.get("impression_count", 0)),
        "likes": int(public_metrics.get("like_count", 0)),
        "reposts": int(public_metrics.get("retweet_count", 0)),
        "replies": int(public_metrics.get("reply_count", 0)),
    }


def rank_posts(posts: List[Dict], top_n: int = 10) -> List[ScoredPost]:
    scored: List[ScoredPost] = []
    for p in posts:
        m = _metrics(p)
        score = (m["impressions"] * 1.0) + (m["likes"] * 20.0) + (m["reposts"] * 30.0)
        scored.append(
            ScoredPost(
                text=(p.get("text") or "").strip(),
                impressions=m["impressions"],
                likes=m["likes"],
                reposts=m["reposts"],
                score=score,
            )
        )
    scored.sort(key=lambda x: x.score, reverse=True)
    return scored[:top_n]


def infer_patterns(top_posts: List[ScoredPost]) -> Dict[str, str]:
    if not top_posts:
        return {
            "hook": "Lead with a direct, high-contrast opening line.",
            "specificity": "Use concrete details and examples.",
            "structure": "Use short lines and clear spacing.",
            "cta": "End with a clear ask (reply/bookmark/follow).",
        }

    avg_len = sum(len(p.text) for p in top_posts) / max(len(top_posts), 1)
    has_number = sum(any(ch.isdigit() for ch in p.text) for p in top_posts)
    question_open = sum(p.text.strip().startswith(("How", "Why", "What", "When")) for p in top_posts)

    hook = "Use a punchy statement hook."
    if question_open >= len(top_posts) // 2:
        hook = "Open with a pointed question hook."

    specificity = "Add specific examples and tactical details."
    if has_number >= len(top_posts) // 2:
        specificity = "Use numbered specifics (steps, counts, or outcomes)."

    structure = "Keep spacing clean with short, skimmable lines."
    if avg_len > 220:
        structure = "Use mini-sections and line breaks to improve readability."

    return {
        "hook": hook,
        "specificity": specificity,
        "structure": structure,
        "cta": "Close with a strong, direct CTA.",
    }


def score_draft(draft: str) -> Dict[str, int]:
    d = draft.strip()
    hook = 8 if len(d.splitlines()[0].split()) <= 14 else 6
    specificity = 8 if any(ch.isdigit() for ch in d) else 6
    shareability = 8 if len(d) < 260 else 6
    clarity = 8 if "\n" in d or len(d.split(".")) > 1 else 6
    return {
        "hook_strength": max(1, min(hook, 10)),
        "specificity": max(1, min(specificity, 10)),
        "shareability": max(1, min(shareability, 10)),
        "clarity": max(1, min(clarity, 10)),
    }


def rewrite_draft(draft: str, patterns: Dict[str, str]) -> str:
    lines = [ln.strip() for ln in draft.strip().splitlines() if ln.strip()]
    if not lines:
        return draft
    first = lines[0]
    if len(first.split()) > 14:
        first = "Most founders are one edit away from a viral post"
    body = lines[1:] if len(lines) > 1 else []
    rewritten = [first, ""]
    rewritten.extend(body[:4])
    if body:
        rewritten.append("")
    rewritten.append("If this helped, reply and I will share the exact checklist.")
    return "\n".join(rewritten).strip()


def generate_advice(draft: str, posts: List[Dict]) -> str:
    top = rank_posts(posts, top_n=10)
    patterns = infer_patterns(top)
    scores = score_draft(draft)
    rewritten = rewrite_draft(draft, patterns)

    top_note = "No top posts available."
    if top:
        t = top[0]
        top_note = (
            f"Top post pattern from your data: {t.impressions} impressions, "
            f"{t.likes} likes, {t.reposts} reposts."
        )

    return "\n".join(
        [
            "## Score Snapshot",
            f"- Hook Strength: {scores['hook_strength']}/10",
            f"- Specificity: {scores['specificity']}/10",
            f"- Shareability: {scores['shareability']}/10",
            f"- Clarity: {scores['clarity']}/10",
            "",
            "## What Works",
            "- The draft has a clear core message.",
            "",
            "## Improve Next",
            f"- Hook: {patterns['hook']}",
            f"- Specificity: {patterns['specificity']}",
            f"- Structure: {patterns['structure']}",
            f"- CTA: {patterns['cta']}",
            "",
            "## Rewritten Draft",
            rewritten,
            "",
            "## Why These Changes",
            f"- {top_note}",
            "- Applied winning patterns to hook, specificity, structure, and CTA.",
        ]
    )
