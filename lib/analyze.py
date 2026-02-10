from __future__ import annotations

from dataclasses import dataclass
import re
from collections import Counter
from typing import Dict, List, Sequence

from lib.guidelines import GENERIC_WRITING_GUIDELINES


@dataclass
class ScoredPost:
    post_id: str
    text: str
    impressions: int
    likes: int
    reposts: int
    replies: int
    quotes: int
    score: float


def _metrics(post: Dict) -> Dict:
    public_metrics = post.get("public_metrics", {}) or {}
    non_public = post.get("non_public_metrics", {}) or {}
    return {
        "impressions": int(non_public.get("impression_count", 0)),
        "likes": int(public_metrics.get("like_count", 0)),
        "reposts": int(public_metrics.get("retweet_count", 0)),
        "replies": int(public_metrics.get("reply_count", 0)),
        "quotes": int(public_metrics.get("quote_count", 0)),
    }


def rank_posts(posts: List[Dict], top_n: int = 10) -> List[ScoredPost]:
    scored: List[ScoredPost] = []
    for p in posts:
        m = _metrics(p)
        # Owned-account ranking: impressions are primary, likes/reposts/replies/quotes are tie-breakers.
        score = (
            (m["impressions"] * 1.0)
            + (m["likes"] * 20.0)
            + (m["reposts"] * 30.0)
            + (m["replies"] * 12.0)
            + (m["quotes"] * 18.0)
        )
        scored.append(
            ScoredPost(
                post_id=str(p.get("id", "")),
                text=(p.get("text") or "").strip(),
                impressions=m["impressions"],
                likes=m["likes"],
                reposts=m["reposts"],
                replies=m["replies"],
                quotes=m["quotes"],
                score=score,
            )
        )
    scored.sort(key=lambda x: x.score, reverse=True)
    return scored[:top_n]


def infer_patterns(top_posts: Sequence[ScoredPost]) -> Dict[str, str]:
    if not top_posts:
        return {
            "hook": "Lead with a direct, high-contrast opening line.",
            "specificity": "Use concrete details and examples.",
            "structure": "Use short lines and clear spacing.",
            "cta": "End with a clear ask (reply/bookmark/follow).",
        }

    avg_len = sum(len(p.text) for p in top_posts) / max(len(top_posts), 1)
    has_number = sum(any(ch.isdigit() for ch in p.text) for p in top_posts)
    question_open = sum(
        p.text.strip().startswith(("How", "Why", "What", "When")) for p in top_posts
    )

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


def extract_topics(draft: str, max_topics: int = 5) -> List[str]:
    hashtag_topics = re.findall(r"#([A-Za-z0-9_]{2,40})", draft)
    cleaned_hashtags = [f"#{h.lower()}" for h in hashtag_topics]
    stopwords = {
        "that",
        "this",
        "with",
        "from",
        "your",
        "have",
        "will",
        "what",
        "when",
        "where",
        "which",
        "about",
        "there",
        "their",
        "them",
        "they",
        "just",
        "like",
        "into",
        "over",
        "make",
        "more",
        "most",
        "really",
        "very",
        "only",
        "than",
        "then",
        "been",
        "because",
        "while",
    }
    words = re.findall(r"[A-Za-z][A-Za-z0-9\-]{2,30}", draft.lower())
    words = [w for w in words if w not in stopwords and not w.startswith("http")]
    common = [w for w, _ in Counter(words).most_common(20)]
    merged: List[str] = []
    for t in cleaned_hashtags + common:
        if t not in merged:
            merged.append(t)
    return merged[:max_topics]


def rank_public_posts(posts: List[Dict], top_n: int = 5) -> List[ScoredPost]:
    scored: List[ScoredPost] = []
    for p in posts:
        m = _metrics(p)
        # Topic search ranking: public metrics only.
        score = (
            (m["likes"] * 1.0)
            + (m["reposts"] * 2.0)
            + (m["replies"] * 1.5)
            + (m["quotes"] * 2.0)
        )
        scored.append(
            ScoredPost(
                post_id=str(p.get("id", "")),
                text=(p.get("text") or "").strip(),
                impressions=m["impressions"],
                likes=m["likes"],
                reposts=m["reposts"],
                replies=m["replies"],
                quotes=m["quotes"],
                score=score,
            )
        )
    scored.sort(key=lambda x: x.score, reverse=True)
    return scored[:top_n]


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


def _guideline_gaps(draft: str) -> List[str]:
    gaps: List[str] = []
    lines = [ln.strip() for ln in draft.splitlines() if ln.strip()]
    text = draft.strip()
    if not lines:
        return ["Draft is empty."]
    first = lines[0]
    if len(first.split()) > 14:
        gaps.append("Hook is long; tighten the opening into a high-contrast line.")
    if not any(ch.isdigit() for ch in text):
        gaps.append("Add concrete numbers, steps, or specific examples.")
    if len(lines) < 3:
        gaps.append("Add spacing and structure so the post is easier to scan.")
    if "?" not in text and "reply" not in text.lower() and "follow" not in text.lower():
        gaps.append("Add a direct CTA (reply, follow, bookmark, or click).")
    if not any(k in text.lower() for k in ("how to", "step", "example", "template")):
        gaps.append("Include practical HOW details or an explicit example/template.")
    return gaps


def _bar_line(topic_hint: str) -> str:
    if topic_hint:
        return f"The market rewards clear {topic_hint} ideas, not vague content."
    return "Clarity compounds; vague advice gets ignored."


def rewrite_draft(draft: str, patterns: Dict[str, str], topic_hint: str = "") -> str:
    lines = [ln.strip() for ln in draft.strip().splitlines() if ln.strip()]
    if not lines:
        return draft
    first = lines[0]
    if len(first.split()) > 14:
        first = "Most creators are one edit away from a high-performing post"
    body = lines[1:] if len(lines) > 1 else []
    rewritten = [first, ""]
    rewritten.extend(body[:4])
    rewritten.append("")
    rewritten.append(_bar_line(topic_hint))
    rewritten.append("Reply 'checklist' and I will send the exact framework.")
    return "\n".join(rewritten).strip()


def _shorten_text(text: str, limit: int = 210) -> str:
    compact = " ".join(text.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"


def _draft_idea_core(draft: str) -> str:
    lines = [ln.strip() for ln in draft.splitlines() if ln.strip()]
    if not lines:
        return "strong writing systems"
    return _shorten_text(lines[0], 90).rstrip(".!?")


def generate_versions(draft: str, patterns: Dict[str, str], topic_hint: str) -> List[str]:
    core = _draft_idea_core(draft)
    bar = _bar_line(topic_hint)
    versions = [
        "\n".join(
            [
                f"{core}: most people fail because they stay generic.",
                "",
                "3 things to change today:",
                "1) Lead with a high-contrast hook",
                "2) Add concrete examples and numbers",
                "3) End with a clear CTA + bar line",
                "",
                f"{bar}",
                "Reply 'v1' and I will send my exact template.",
            ]
        ),
        "\n".join(
            [
                "If your posts are not converting, use this 4-step rewrite:",
                "",
                "Hook -> Specific proof -> Tactical steps -> CTA",
                "",
                f"Applied to {core.lower()}.",
                bar,
                "Bookmark this and test it on your next post.",
            ]
        ),
        "\n".join(
            [
                f"Most advice on {topic_hint or 'content'} is too high-level.",
                "",
                "What actually works:",
                "- concrete numbers",
                "- clean spacing",
                "- one memorable closing line",
                "",
                bar,
                "Follow for more tactical writing breakdowns.",
            ]
        ),
        "\n".join(
            [
                f"Framework I use for {core.lower()}:",
                "",
                "Problem line",
                "Proof from real results",
                "3 practical steps",
                "Mic-drop close",
                "",
                bar,
                "Reply 'framework' and I will share examples.",
            ]
        ),
        "\n".join(
            [
                f"You do not need better ideas for {core.lower()}.",
                "You need better packaging.",
                "",
                "Make it specific. Make it actionable. Make it unforgettable.",
                "",
                bar,
                "If this is useful, repost and I will write part 2.",
            ]
        ),
    ]
    # Thread-aware tweak if pattern inference suggests question hooks.
    if "question" in patterns.get("hook", "").lower():
        versions[1] = versions[1].replace(
            "If your posts are not converting, use this 4-step rewrite:",
            "Why do good ideas still flop on X? Use this 4-step rewrite:",
        )
    return versions


def generate_advice(
    draft: str,
    posts: List[Dict],
    topic_research: Dict | None = None,
    topics: List[str] | None = None,
    account_fetch_error: str | None = None,
) -> str:
    top = rank_posts(posts, top_n=10)
    patterns = infer_patterns(top)
    scores = score_draft(draft)
    resolved_topics = topics or extract_topics(draft, max_topics=5)
    topic_hint = resolved_topics[0] if resolved_topics else "writing"
    rewritten = rewrite_draft(draft, patterns, topic_hint=topic_hint)
    versions = generate_versions(draft, patterns, topic_hint=topic_hint)
    gaps = _guideline_gaps(draft)

    top_note = "No top posts available from your account data."
    if top:
        t = top[0]
        top_note = (
            f"Top post pattern from your data: {t.impressions} impressions, "
            f"{t.likes} likes, {t.reposts} reposts, {t.replies} replies."
        )
    if account_fetch_error:
        top_note = f"Account post fetch unavailable: {account_fetch_error}"

    topic_lines: List[str] = []
    if topic_research and isinstance(topic_research, dict):
        research_topics = topic_research.get("topics", {}) or {}
        if research_topics:
            for topic, topic_posts in research_topics.items():
                top_topic_posts = rank_public_posts(topic_posts, top_n=2)
                if not top_topic_posts:
                    continue
                top_a = top_topic_posts[0]
                topic_lines.append(
                    f"- {topic}: high engagement favors concise hooks and tactical specificity "
                    f"(top sample: {top_a.likes} likes, {top_a.reposts} reposts, {top_a.replies} replies)."
                )
        elif topic_research.get("meta", {}).get("error"):
            topic_lines.append(
                f"- Topic research unavailable: {topic_research['meta']['error']}"
            )
    if not topic_lines:
        topic_lines.append("- No topic research data available; suggestions rely on account patterns + guidelines.")

    guideline_lines = [f"- {g}" for g in GENERIC_WRITING_GUIDELINES[:8]]
    gap_lines = [f"- {g}" for g in gaps] if gaps else ["- Draft aligns well with core system rules."]
    version_lines: List[str] = []
    for i, v in enumerate(versions, start=1):
        version_lines.extend([f"### Version {i}", v, ""])

    return "\n".join(
        [
            "## Score Snapshot",
            f"- Hook Strength: {scores['hook_strength']}/10",
            f"- Specificity: {scores['specificity']}/10",
            f"- Shareability: {scores['shareability']}/10",
            f"- Clarity: {scores['clarity']}/10",
            "",
            "## Writing System Guidelines Applied",
            *guideline_lines,
            "",
            "## Personal Learnings (Last 30 Days)",
            f"- {top_note}",
            f"- Hook: {patterns['hook']}",
            f"- Specificity: {patterns['specificity']}",
            f"- Structure: {patterns['structure']}",
            f"- CTA: {patterns['cta']}",
            "",
            "## Topic Research Learnings",
            *topic_lines,
            "",
            "## Improvement Suggestions",
            *gap_lines,
            "",
            "## Rewritten Draft (Primary)",
            rewritten,
            "",
            "## 5 Improved X Post Versions",
            *version_lines,
        ]
    )
