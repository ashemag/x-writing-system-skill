#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from lib.analyze import extract_topics, generate_advice
from lib.api import fetch_recent_posts, iso_utc_now_minus_days, search_topic_posts
from lib.env import default_env_candidates, load_env_files


def read_draft(args: argparse.Namespace) -> str:
    if args.draft:
        return args.draft
    if args.draft_file:
        return Path(args.draft_file).read_text(encoding="utf-8")
    raise ValueError("Provide --draft or --draft-file")


def cmd_fetch(args: argparse.Namespace) -> int:
    if args.print_start_time:
        print(iso_utc_now_minus_days(args.days))
        return 0

    result = fetch_recent_posts(
        days=args.days,
        max_results=args.max_results,
        username=args.username,
        user_id=args.user_id,
    )
    if args.out:
        out = Path(args.out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"Wrote {result['meta']['post_count']} posts to {out}")
    else:
        print(json.dumps(result, indent=2))
    return 0


def cmd_advise(args: argparse.Namespace) -> int:
    draft = read_draft(args)
    posts_path = args.posts
    account_fetch_error = None
    if not posts_path:
        try:
            fetched = fetch_recent_posts(
                days=args.days,
                max_results=args.max_results,
                username=args.username,
                user_id=args.user_id,
            )
            posts = fetched.get("data", [])
        except Exception as exc:
            posts = []
            account_fetch_error = str(exc)
    else:
        payload = json.loads(Path(posts_path).read_text(encoding="utf-8"))
        posts = payload.get("data", payload if isinstance(payload, list) else [])

    resolved_topics = (
        [t.strip() for t in args.topics.split(",") if t.strip()]
        if args.topics
        else extract_topics(draft, max_topics=args.max_topics)
    )

    topic_research = None
    if not args.no_topic_research and resolved_topics:
        try:
            topic_research = search_topic_posts(
                topics=resolved_topics,
                days=args.topic_days,
                per_topic_results=args.topic_max_results,
            )
        except Exception as exc:
            topic_research = {
                "meta": {"error": str(exc)},
                "topics": {},
            }

    advice = generate_advice(
        draft,
        posts,
        topic_research=topic_research,
        topics=resolved_topics,
        account_fetch_error=account_fetch_error,
    )
    print(advice)
    return 0


def _bootstrap_env(args: argparse.Namespace) -> None:
    repo_root = Path(__file__).resolve().parent
    explicit_files = [Path(p) for p in (args.env_file or [])]
    default_files = default_env_candidates(repo_root)
    candidates = explicit_files + default_files
    load_env_files(candidates)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="X writing system CLI")
    sub = parser.add_subparsers(dest="command", required=True)

    fetch = sub.add_parser("fetch", help="Fetch recent posts")
    fetch.add_argument("--days", type=int, default=30)
    fetch.add_argument("--max-results", type=int, default=100)
    fetch.add_argument("--username", type=str, default=None)
    fetch.add_argument("--user-id", type=str, default=None)
    fetch.add_argument("--out", type=str, default=None)
    fetch.add_argument("--print-start-time", action="store_true")
    fetch.set_defaults(func=cmd_fetch)

    advise = sub.add_parser("advise", help="Generate writing suggestions")
    advise.add_argument("--draft", type=str, default=None)
    advise.add_argument("--draft-file", type=str, default=None)
    advise.add_argument("--posts", type=str, default=None)
    advise.add_argument("--days", type=int, default=30)
    advise.add_argument("--max-results", type=int, default=100)
    advise.add_argument("--username", type=str, default=None)
    advise.add_argument("--user-id", type=str, default=None)
    advise.add_argument("--topics", type=str, default=None, help="Comma-separated topic overrides")
    advise.add_argument("--max-topics", type=int, default=5, help="Max extracted topics from draft")
    advise.add_argument("--topic-days", type=int, default=7, help="Lookback days for topic research")
    advise.add_argument("--topic-max-results", type=int, default=25, help="Per-topic X search result cap")
    advise.add_argument("--no-topic-research", action="store_true")
    advise.set_defaults(func=cmd_advise)

    for p in (fetch, advise):
        p.add_argument(
            "--env-file",
            action="append",
            default=None,
            help="Optional .env file(s) to load. Can be passed multiple times.",
        )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    _bootstrap_env(args)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
