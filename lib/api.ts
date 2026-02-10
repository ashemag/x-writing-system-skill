/**
 * X API wrapper — bearer token only, same pattern as rohunvora/x-research-skill.
 * Token from X_BEARER_TOKEN (env or ~/.config/env/global.env).
 */
import { readFileSync } from "node:fs";
import type {
  FetchRecentPostsResult,
  Post,
  TopicResearchResult,
  TrendsResult,
  TrendItem,
} from "./types";

const API_BASE = "https://api.x.com/2";

function getToken(): string {
  if (process.env.X_BEARER_TOKEN?.trim()) return process.env.X_BEARER_TOKEN.trim();
  try {
    const path = `${process.env.HOME}/.config/env/global.env`;
    const content = readFileSync(path, "utf8");
    const match = content.match(/X_BEARER_TOKEN=["']?([^"'\n]+)/);
    if (match?.[1]) return match[1];
  } catch {
    // ignore
  }
  throw new Error("X_BEARER_TOKEN not found in env or ~/.config/env/global.env");
}

export function isoUtcNowMinusDays(days: number): string {
  const now = Date.now();
  const ms = Math.max(0, days) * 24 * 60 * 60 * 1000;
  const dt = new Date(now - ms);
  return dt.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function authHeaders(url: string, query: Record<string, string>): Record<string, string> {
  const token = getToken();
  return { Authorization: `Bearer ${token}` };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

function envNum(name: string, fallback: number): number {
  const raw = Number(process.env[name] ?? "");
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

async function httpGet<T>(
  url: string,
  query: Record<string, string>,
  headers: Record<string, string>
): Promise<T> {
  const qs = new URLSearchParams(query);
  const endpoint = `${url}?${qs.toString()}`;
  const waitForReset = envBool("X_WAIT_RATE_LIMIT_RESET", true);
  const maxRetries = Math.max(0, envNum("X_RATE_LIMIT_MAX_RETRIES", 2));
  let attempt = 0;

  while (true) {
    const res = await fetch(endpoint, { method: "GET", headers });
    if (res.ok) return (await res.json()) as T;

    const text = await res.text().catch(() => "");
    const limit = res.headers.get("x-rate-limit-limit");
    const remaining = res.headers.get("x-rate-limit-remaining");
    const reset = res.headers.get("x-rate-limit-reset");
    const headerNote =
      limit || remaining || reset
        ? ` (rate-limit: limit=${limit ?? "?"}, remaining=${remaining ?? "?"}, reset=${reset ?? "?"})`
        : "";
    const bodyNote = text ? ` body=${text.slice(0, 240)}` : "";
    const loweredBody = text.toLowerCase();
    const usageCapped =
      loweredBody.includes("usagecapsexceeded") ||
      loweredBody.includes("usage cap exceeded") ||
      loweredBody.includes("\"type\":\"https://api.twitter.com/2/problems/usage-capped\"");

    if (res.status === 429 && usageCapped) {
      throw new Error(
        `HTTP 429: Usage cap exceeded for this X API product/billing period.${headerNote}${bodyNote}`
      );
    }

    if (res.status === 429 && waitForReset && attempt < maxRetries) {
      const nowSec = Math.floor(Date.now() / 1000);
      const resetEpoch = Number(reset ?? "0");
      const waitSec = Number.isFinite(resetEpoch) && resetEpoch > 0
        ? Math.max(resetEpoch - nowSec, 1)
        : Math.min(5 * (attempt + 1), 30);
      // Leave a small buffer after reset to avoid edge-of-window retries.
      await sleep((waitSec * 1000) + 400);
      attempt += 1;
      continue;
    }

    throw new Error(`HTTP ${res.status}: ${res.statusText}${headerNote}${bodyNote}`);
  }
}

async function resolveUserId(username: string): Promise<string> {
  const url = `${API_BASE}/users/by/username/${encodeURIComponent(username)}`;
  const query = { "user.fields": "id" };
  const headers = authHeaders(url, query);
  const data = await httpGet<{ data?: { id?: string } }>(url, query, headers);
  const userId = data.data?.id;
  if (!userId) throw new Error(`Could not resolve user id for @${username}`);
  return userId;
}

export async function fetchRecentPosts(args: {
  days: number;
  maxResults: number;
  username?: string;
  userId?: string;
}): Promise<FetchRecentPostsResult> {
  const startTime = isoUtcNowMinusDays(args.days);
  let username = args.username ?? process.env.X_USERNAME;
  let userId = args.userId ?? process.env.X_USER_ID;
  if (userId && !/^\d+$/.test(userId)) {
    if (!username) username = userId;
    userId = undefined;
  }
  if (!userId) {
    if (!username) throw new Error("Provide username/user id or set X_USERNAME/X_USER_ID.");
    userId = await resolveUserId(username);
  }
  const url = `${API_BASE}/users/${userId}/tweets`;
  const query = {
    start_time: startTime,
    max_results: String(Math.max(5, Math.min(args.maxResults, 100))),
    "tweet.fields": "created_at,public_metrics",
  };
  const headers = authHeaders(url, query);
  const response = await httpGet<{ data?: Post[]; meta?: Record<string, unknown> }>(url, query, headers);
  return {
    meta: {
      days: args.days,
      start_time: startTime,
      auth_mode: "bearer",
      username,
      user_id: userId,
      post_count: response.data?.length ?? 0,
    },
    data: response.data ?? [],
    raw_meta: response.meta ?? {},
  };
}

function topicQuery(topic: string): string {
  const cleaned = topic.trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  return `(${cleaned}) lang:en -is:retweet -is:reply`;
}

export async function searchTopicPosts(args: {
  topics: string[];
  days: number;
  perTopicResults: number;
  combineTopicCalls?: boolean;
  performantLikeThreshold?: number;
  maxTopicSearchAttempts?: number;
}): Promise<TopicResearchResult> {
  const days = Math.max(1, Math.min(args.days, 7));
  const startTime = isoUtcNowMinusDays(days);
  const perTopicResults = Math.max(10, Math.min(args.perTopicResults, 100));
  const combineTopicCalls = args.combineTopicCalls ?? true;
  const performantLikeThreshold = Math.max(1, args.performantLikeThreshold ?? 50);
  const maxTopicSearchAttempts = Math.max(1, Math.min(args.maxTopicSearchAttempts ?? 3, 5));
  const url = `${API_BASE}/tweets/search/recent`;

  const payload: TopicResearchResult = {
    meta: {
      auth_mode: "bearer",
      days,
      start_time: startTime,
      per_topic_results: perTopicResults,
      topic_count: args.topics.length,
      note: combineTopicCalls
        ? "Recent search endpoint with single combined topic query, then local topic bucketing."
        : "Recent search endpoint with one API request per topic.",
      strategy: combineTopicCalls
        ? "Adaptive combined topic search (broadens query terms until performant posts are found or attempt limit is reached)."
        : "One-call-per-topic mode.",
      api_calls_estimate: combineTopicCalls
        ? Math.max(1, maxTopicSearchAttempts)
        : Math.max(1, args.topics.length),
      est_cost_usd:
        (combineTopicCalls
          ? Math.max(1, maxTopicSearchAttempts)
          : Math.max(1, args.topics.length)) *
        Math.max(10, Math.min(args.perTopicResults, 100)) *
        0.005,
      attempts_used: 0,
      performant_like_threshold: performantLikeThreshold,
    },
    topics: {},
  };

  const quoteForQuery = (topic: string): string => {
    const clean = topic.trim().replace(/\s+/g, " ").replace(/"/g, "");
    if (!clean) return "";
    if (clean.includes(" ")) return `"${clean}"`;
    return clean;
  };

  const toTokens = (topic: string): string[] => {
    const lower = topic.toLowerCase().replace(/^#/, "");
    return lower
      .split(/[^a-z0-9]+/)
      .map((t) => t.trim())
      .filter((t) => t.length >= 3);
  };

  const buildTermsForAttempt = (topics: string[], attempt: number): string[] => {
    const terms: string[] = [];
    for (const topic of topics) {
      const phrase = quoteForQuery(topic);
      if (phrase) terms.push(phrase);
      if (attempt >= 2) {
        const tokens = toTokens(topic);
        for (const token of tokens) {
          if (token.length >= 4) terms.push(token);
        }
      }
      if (attempt >= 3) {
        const cleaned = topic.toLowerCase().replace(/^#/, "").replace(/[^a-z0-9 ]/g, " ");
        const parts = cleaned.split(/\s+/).filter((x) => x.length >= 3);
        if (parts.length >= 2) {
          terms.push(`"${parts.slice(0, 2).join(" ")}"`);
        }
      }
    }
    return [...new Set(terms)].slice(0, 24);
  };

  const buildCombinedQuery = (topics: string[], attempt: number): string => {
    const terms = buildTermsForAttempt(topics, attempt);
    if (terms.length === 0) return "";
    const base = `(${terms.join(" OR ")})`;
    if (attempt === 1) return `${base} lang:en -is:retweet -is:reply`;
    if (attempt === 2) return `${base} lang:en -is:retweet`;
    return `${base} -is:retweet`;
  };

  const mergeBuckets = (left: Record<string, Post[]>, right: Record<string, Post[]>): Record<string, Post[]> => {
    const merged: Record<string, Post[]> = {};
    const topics = [...new Set([...Object.keys(left), ...Object.keys(right)])];
    for (const topic of topics) {
      const seen = new Set<string>();
      const combined = [...(left[topic] ?? []), ...(right[topic] ?? [])];
      merged[topic] = combined.filter((post) => {
        const id = post.id ?? "";
        if (!id) return true;
        if (seen.has(id)) return false;
        seen.add(id);
        return true;
      });
    }
    return merged;
  };

  const hasPerformantPosts = (buckets: Record<string, Post[]>, likeThreshold: number): boolean => {
    for (const posts of Object.values(buckets)) {
      for (const p of posts) {
        const likes = Number(p.public_metrics?.like_count ?? 0);
        if (likes > likeThreshold) return true;
      }
    }
    return false;
  };

  const bucketByTopic = (
    topics: string[],
    posts: Post[],
    perBucketLimit: number
  ): Record<string, Post[]> => {
    const buckets: Record<string, Post[]> = {};
    for (const topic of topics) buckets[topic] = [];
    for (const p of posts) {
      const text = (p.text ?? "").toLowerCase();
      for (const topic of topics) {
        const normalized = topic.toLowerCase().trim().replace(/^#/, "");
        const tokens = toTokens(topic);
        const directMatch = normalized.length >= 3 && text.includes(normalized);
        const tokenMatch = tokens.length > 0 && tokens.every((tk) => text.includes(tk));
        const hashtagMatch = text.includes(`#${normalized}`);
        if (directMatch || tokenMatch || hashtagMatch) {
          buckets[topic].push(p);
        }
      }
    }
    for (const topic of topics) {
      const seen = new Set<string>();
      buckets[topic] = buckets[topic]
        .filter((post) => {
          const id = post.id ?? "";
          if (!id) return true;
          if (seen.has(id)) return false;
          seen.add(id);
          return true;
        })
        .slice(0, perBucketLimit);
    }
    return buckets;
  };

  const result: TopicResearchResult = {
    ...payload,
    topics: {},
  };
  if (combineTopicCalls) {
    const aggregateBuckets: Record<string, Post[]> = {};
    let attemptsUsed = 0;
    for (let attempt = 1; attempt <= maxTopicSearchAttempts; attempt++) {
      const combinedQuery = buildCombinedQuery(args.topics, attempt);
      if (!combinedQuery) continue;
      const maxResults = Math.max(
        10,
        Math.min(perTopicResults * Math.max(args.topics.length, 1) * Math.min(attempt, 2), 100)
      );
      const query = {
        query: combinedQuery,
        start_time: startTime,
        max_results: String(maxResults),
        "tweet.fields": "created_at,public_metrics,author_id",
      };
      const headers = authHeaders(url, query);
      const data = await httpGet<{ data?: Post[] }>(url, query, headers);
      const posts = data.data ?? [];
      const passBuckets = bucketByTopic(args.topics, posts, perTopicResults);
      const merged = mergeBuckets(aggregateBuckets, passBuckets);
      Object.assign(aggregateBuckets, merged);
      attemptsUsed = attempt;
      if (hasPerformantPosts(aggregateBuckets, performantLikeThreshold)) {
        break;
      }
    }
    result.meta.attempts_used = attemptsUsed;
    result.topics = aggregateBuckets;
    return result;
  }
  for (const topic of args.topics) {
    const queryText = topicQuery(topic);
    if (!queryText) continue;
    const query = {
      query: queryText,
      start_time: startTime,
      max_results: String(perTopicResults),
      "tweet.fields": "created_at,public_metrics,author_id",
    };
    const headers = authHeaders(url, query);
    const data = await httpGet<{ data?: Post[] }>(url, query, headers);
    result.topics[topic] = data.data ?? [];
  }
  result.meta.attempts_used = 1;
  return result;
}

function normalizeTrendItem(raw: Record<string, unknown>): TrendItem | null {
  const name = String(raw.trend_name ?? raw.name ?? raw.query ?? "").trim();
  if (!name) return null;
  const postCountRaw = raw.post_count ?? raw.tweet_count ?? raw.volume;
  const postCount = Number(postCountRaw);
  return {
    name,
    post_count: Number.isFinite(postCount) && postCount > 0 ? postCount : undefined,
  };
}

export async function fetchTrendsByWoeid(args: {
  woeid?: number;
  limit?: number;
}): Promise<TrendsResult> {
  const woeid = Math.max(1, args.woeid ?? 1);
  const limit = Math.max(1, Math.min(args.limit ?? 25, 100));
  const url = `${API_BASE}/trends/by/woeid/${woeid}`;
  const query = { max_trends: String(limit) };
  try {
    const headers = authHeaders(url, query);
    const response = await httpGet<{ data?: Array<Record<string, unknown>> }>(url, query, headers);
    const trends = (response.data ?? [])
      .map((item) => normalizeTrendItem(item))
      .filter((x): x is TrendItem => Boolean(x))
      .slice(0, limit);
    return {
      meta: {
        woeid,
        trend_count: trends.length,
        note: `Trends lookup for WOEID ${woeid}.`,
      },
      trends,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      meta: {
        woeid,
        trend_count: 0,
        note: `Trends lookup unavailable for WOEID ${woeid}.`,
        error: message,
      },
      trends: [],
    };
  }
}
