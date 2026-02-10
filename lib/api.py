from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Tuple

API_BASE = "https://api.x.com/2"


def iso_utc_now_minus_days(days: int = 30) -> str:
    dt = datetime.now(timezone.utc) - timedelta(days=days)
    return dt.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _percent_encode(value: str) -> str:
    return urllib.parse.quote(value, safe="-._~")


def _normalized_params(params: Dict[str, str]) -> str:
    items: List[Tuple[str, str]] = sorted((k, v) for k, v in params.items())
    return "&".join(f"{_percent_encode(k)}={_percent_encode(v)}" for k, v in items)


def oauth1_header(method: str, url: str, query_params: Dict[str, str]) -> str:
    consumer_key = os.getenv("X_API_KEY")
    consumer_secret = os.getenv("X_API_KEY_SECRET")
    access_token = os.getenv("X_ACCESS_TOKEN")
    access_token_secret = os.getenv("X_ACCESS_TOKEN_SECRET")
    if not all([consumer_key, consumer_secret, access_token, access_token_secret]):
        raise ValueError(
            "Missing OAuth 1.0a env vars: X_API_KEY, X_API_KEY_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET"
        )

    oauth_params = {
        "oauth_consumer_key": consumer_key,
        "oauth_nonce": secrets.token_hex(16),
        "oauth_signature_method": "HMAC-SHA1",
        "oauth_timestamp": str(int(time.time())),
        "oauth_token": access_token,
        "oauth_version": "1.0",
    }
    sig_params = dict(query_params)
    sig_params.update(oauth_params)
    parameter_string = _normalized_params(sig_params)
    base_string = "&".join(
        [method.upper(), _percent_encode(url), _percent_encode(parameter_string)]
    )
    signing_key = f"{_percent_encode(consumer_secret)}&{_percent_encode(access_token_secret)}"
    digest = hmac.new(signing_key.encode(), base_string.encode(), hashlib.sha1).digest()
    oauth_params["oauth_signature"] = base64.b64encode(digest).decode()
    header = ", ".join(
        f'{_percent_encode(k)}="{_percent_encode(v)}"' for k, v in sorted(oauth_params.items())
    )
    return f"OAuth {header}"


def http_get(url: str, params: Dict[str, str], headers: Dict[str, str]) -> Dict:
    query = urllib.parse.urlencode(params)
    request_url = f"{url}?{query}" if query else url
    req = urllib.request.Request(request_url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _auth_mode() -> str:
    oauth1_available = all(
        [
            os.getenv("X_API_KEY"),
            os.getenv("X_API_KEY_SECRET"),
            os.getenv("X_ACCESS_TOKEN"),
            os.getenv("X_ACCESS_TOKEN_SECRET"),
        ]
    )
    bearer_available = bool(os.getenv("X_BEARER_TOKEN"))
    if not oauth1_available and not bearer_available:
        raise ValueError("No auth found. Set OAuth 1.0a vars or X_BEARER_TOKEN.")
    return "oauth1" if oauth1_available else "bearer"


def auth_headers(method: str, url: str, params: Dict[str, str], auth_mode: str) -> Dict[str, str]:
    if auth_mode == "oauth1":
        return {"Authorization": oauth1_header(method, url, params)}
    bearer = os.getenv("X_BEARER_TOKEN")
    if not bearer:
        raise ValueError("Missing X_BEARER_TOKEN")
    return {"Authorization": f"Bearer {bearer}"}


def resolve_user_id(username: str, use_oauth1: bool) -> str:
    url = f"{API_BASE}/users/by/username/{urllib.parse.quote(username, safe='')}"
    params = {"user.fields": "id"}
    if use_oauth1:
        headers = {"Authorization": oauth1_header("GET", url, params)}
    else:
        bearer = os.getenv("X_BEARER_TOKEN")
        if not bearer:
            raise ValueError("Missing X_BEARER_TOKEN")
        headers = {"Authorization": f"Bearer {bearer}"}
    data = http_get(url, params, headers)
    user_id = (data.get("data") or {}).get("id")
    if not user_id:
        raise RuntimeError(f"Could not resolve user id. Response: {data}")
    return user_id


def fetch_recent_posts(days: int = 30, max_results: int = 100, username: str | None = None, user_id: str | None = None) -> Dict:
    start_time = iso_utc_now_minus_days(days)
    auth_mode = _auth_mode()
    username = username or os.getenv("X_USERNAME")
    user_id = user_id or os.getenv("X_USER_ID")
    if not user_id:
        if not username:
            raise ValueError("Provide --username/--user-id or X_USERNAME/X_USER_ID")
        user_id = resolve_user_id(username, use_oauth1=(auth_mode == "oauth1"))

    url = f"{API_BASE}/users/{user_id}/tweets"
    fields = ["created_at", "public_metrics"]
    if auth_mode == "oauth1":
        fields.append("non_public_metrics")
    params = {
        "start_time": start_time,
        "max_results": str(max(5, min(max_results, 100))),
        "tweet.fields": ",".join(fields),
    }
    headers = auth_headers("GET", url, params, auth_mode)

    data = http_get(url, params, headers)
    return {
        "meta": {
            "days": days,
            "start_time": start_time,
            "auth_mode": auth_mode,
            "username": username,
            "user_id": user_id,
            "post_count": len(data.get("data", [])),
        },
        "data": data.get("data", []),
        "raw_meta": data.get("meta", {}),
    }


def _topic_query(topic: str) -> str:
    cleaned = " ".join(topic.strip().split())
    if not cleaned:
        return ""
    # Exclude replies/retweets to bias toward primary authored posts.
    return f"({cleaned}) lang:en -is:retweet -is:reply"


def search_topic_posts(topics: List[str], days: int = 7, per_topic_results: int = 25) -> Dict:
    auth_mode = _auth_mode()
    lookback_days = max(1, min(days, 7))
    start_time = iso_utc_now_minus_days(lookback_days)
    payload: Dict[str, object] = {
        "meta": {
            "auth_mode": auth_mode,
            "days": lookback_days,
            "start_time": start_time,
            "per_topic_results": max(10, min(per_topic_results, 100)),
            "topic_count": len(topics),
            "note": "Search API recent endpoint is used and then ranked by public engagement.",
        },
        "topics": {},
    }
    search_url = f"{API_BASE}/tweets/search/recent"
    for topic in topics:
        query = _topic_query(topic)
        if not query:
            continue
        params = {
            "query": query,
            "max_results": str(max(10, min(per_topic_results, 100))),
            "start_time": start_time,
            "tweet.fields": "created_at,public_metrics,author_id",
        }
        headers = auth_headers("GET", search_url, params, auth_mode)
        data = http_get(search_url, params, headers)
        payload["topics"][topic] = data.get("data", [])
    return payload
