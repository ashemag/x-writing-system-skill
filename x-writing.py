#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from lib.analyze import generate_advice
from lib.api import fetch_recent_posts, iso_utc_now_minus_days


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
    if not posts_path:
        fetched = fetch_recent_posts(
            days=args.days,
            max_results=args.max_results,
            username=args.username,
            user_id=args.user_id,
        )
        posts = fetched.get("data", [])
    else:
        payload = json.loads(Path(posts_path).read_text(encoding="utf-8"))
        posts = payload.get("data", payload if isinstance(payload, list) else [])

    advice = generate_advice(draft, posts)
    print(advice)
    return 0


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
    advise.set_defaults(func=cmd_advise)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
