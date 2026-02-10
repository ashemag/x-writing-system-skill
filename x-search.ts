#!/usr/bin/env bun
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateAdvice, extractTopics } from "./lib/analyze";
import { fetchRecentPosts, searchTopicPosts, fetchTrendsByWoeid } from "./lib/api";
import { cacheKey, readCache, writeCache } from "./lib/cache";
import { defaultEnvCandidates, loadEnvFiles } from "./lib/env";
import { printHelp, printJson, writeMarkdownOutput } from "./lib/format";
import type { FetchRecentPostsResult, TopicResearchResult, TrendsResult } from "./lib/types";

type Flags = Record<string, string | boolean>;
const SKILL_DIR = import.meta.dir;

function parseArgs(argv: string[]): { command: string; flags: Flags } {
  const [command = "help", ...rest] = argv;
  const flags: Flags = {};
  let i = 0;
  while (i < rest.length) {
    const token = rest[i];
    if (!token.startsWith("--")) {
      i += 1;
      continue;
    }
    const key = token.slice(2);
    const next = rest[i + 1];
    if (!next || next.startsWith("--")) {
      flags[key] = true;
      i += 1;
    } else {
      flags[key] = next;
      i += 2;
    }
  }
  return { command, flags };
}

function asString(flags: Flags, key: string, fallback = ""): string {
  const v = flags[key];
  return typeof v === "string" ? v : fallback;
}

function asNum(flags: Flags, key: string, fallback: number): number {
  const v = Number(asString(flags, key, ""));
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

function asBool(flags: Flags, key: string): boolean {
  return Boolean(flags[key]);
}

function bootstrapEnv(flags: Flags): void {
  const envFiles: string[] = [];
  const explicit = asString(flags, "env-file", "");
  if (explicit) envFiles.push(explicit);
  envFiles.push(...defaultEnvCandidates(SKILL_DIR));
  loadEnvFiles(envFiles);
}

async function cmdFetch(flags: Flags): Promise<void> {
  const days = asNum(flags, "days", 30);
  const maxResults = asNum(flags, "max-results", 100);
  const username = asString(flags, "username", "") || undefined;
  const userId = asString(flags, "user-id", "") || undefined;
  const out = asString(flags, "out", "");
  const cacheTtlMs = asNum(flags, "cache-ttl-minutes", 360) * 60 * 1000;
  const key = cacheKey(["fetch", days, maxResults, username ?? "", userId ?? ""]);
  const cached = readCache<FetchRecentPostsResult>(key);
  if (cached) {
    if (out) {
      writeFileSync(resolve(out), JSON.stringify(cached, null, 2), "utf8");
      process.stdout.write(`Wrote cached ${cached.meta.post_count} posts to ${out}\n`);
      return;
    }
    printJson(cached);
    return;
  }

  const data = await fetchRecentPosts({ days, maxResults, username, userId });
  writeCache(key, data, cacheTtlMs);
  if (out) {
    writeFileSync(resolve(out), JSON.stringify(data, null, 2), "utf8");
    process.stdout.write(`Wrote ${data.meta.post_count} posts to ${out}\n`);
  } else {
    printJson(data);
  }
}

async function cmdResearch(flags: Flags): Promise<void> {
  const topics = asString(flags, "topics", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!topics.length) throw new Error("Provide --topics \"a,b,c\" for research.");

  const days = asNum(flags, "topic-days", 7);
  const perTopicResults = asNum(flags, "topic-max-results", 25);
  const performantLikeThreshold = asNum(flags, "performant-like-threshold", 50);
  const maxTopicSearchAttempts = asNum(flags, "topic-search-attempts", 3);
  const quick = asBool(flags, "quick");
  const splitTopicCalls = asBool(flags, "split-topic-calls");
  const ttlMs = quick ? 60 * 60 * 1000 : 15 * 60 * 1000;

  const key = cacheKey([
    "research",
    topics,
    days,
    perTopicResults,
    performantLikeThreshold,
    maxTopicSearchAttempts,
    quick,
    splitTopicCalls,
  ]);
  const cached = readCache<TopicResearchResult>(key);
  if (cached) {
    cached.meta.cached = true;
    cached.meta.cache_key = key;
    printJson(cached);
    return;
  }

  const payload = await searchTopicPosts({
    topics,
    days,
    perTopicResults: quick ? Math.min(perTopicResults, 10) : perTopicResults,
    performantLikeThreshold,
    maxTopicSearchAttempts,
    combineTopicCalls: !splitTopicCalls,
  });
  payload.meta.cached = false;
  payload.meta.cache_key = key;
  writeCache(key, payload, ttlMs);
  printJson(payload);
}

async function cmdAdvise(flags: Flags): Promise<void> {
  const draft = asString(flags, "draft", "");
  const draftFile = asString(flags, "draft-file", "");
  const postsPath = asString(flags, "posts", "");
  const noTopicResearch = asBool(flags, "no-topic-research");
  const quick = asBool(flags, "quick");
  const save = asBool(flags, "save");
  const markdownOut = asString(flags, "out-markdown", "");
  const days = asNum(flags, "days", 30);
  const maxResults = asNum(flags, "max-results", 100);
  const topicDays = asNum(flags, "topic-days", 7);
  const topicMaxResults = asNum(flags, "topic-max-results", 25);
  const performantLikeThreshold = asNum(flags, "performant-like-threshold", 50);
  const maxTopicSearchAttempts = asNum(flags, "topic-search-attempts", 3);
  const splitTopicCalls = asBool(flags, "split-topic-calls");
  const noTrends = asBool(flags, "no-trends");
  const trendsWoeid = asNum(flags, "trends-woeid", 23424977);
  const trendsLimit = asNum(flags, "trends-limit", 30);
  const username = asString(flags, "username", "") || undefined;
  const userId = asString(flags, "user-id", "") || undefined;

  const draftText = draft || (draftFile ? readFileSync(resolve(draftFile), "utf8") : "");
  if (!draftText.trim()) throw new Error("Provide --draft or --draft-file.");

  let posts: FetchRecentPostsResult["data"] = [];
  let accountFetchError: string | null = null;
  if (postsPath) {
    const payload = JSON.parse(readFileSync(resolve(postsPath), "utf8")) as
      | FetchRecentPostsResult
      | { data?: FetchRecentPostsResult["data"] };
    posts = payload.data ?? [];
  } else {
    const fetchKey = cacheKey(["fetch", days, maxResults, username ?? "", userId ?? ""]);
    const cached = readCache<FetchRecentPostsResult>(fetchKey);
    if (cached) {
      posts = cached.data;
    }
    try {
      if (!posts.length) {
        const fetched = await fetchRecentPosts({ days, maxResults, username, userId });
        posts = fetched.data;
        writeCache(fetchKey, fetched, 360 * 60 * 1000);
      }
    } catch (err) {
      accountFetchError = err instanceof Error ? err.message : "Unknown account fetch error.";
      // Best-effort local fallback if a manual fetch file exists.
      if (!posts.length) {
        try {
          const fallback = JSON.parse(
            readFileSync(resolve(SKILL_DIR, "data/recent_posts.json"), "utf8")
          ) as FetchRecentPostsResult;
          posts = fallback.data ?? [];
          accountFetchError = `${accountFetchError} (using local fallback: data/recent_posts.json)`;
        } catch {
          // no-op
        }
      }
    }
  }

  const explicitTopics = asString(flags, "topics", "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const topics = explicitTopics.length ? explicitTopics : extractTopics(draftText, asNum(flags, "max-topics", 5));

  let topicResearch: TopicResearchResult | null = null;
  if (!noTopicResearch && topics.length) {
    const ttlMs = quick ? 60 * 60 * 1000 : 15 * 60 * 1000;
    const key = cacheKey([
      "advice-research",
      topics,
      topicDays,
      topicMaxResults,
      performantLikeThreshold,
      maxTopicSearchAttempts,
      quick,
      splitTopicCalls,
    ]);
    const cached = readCache<TopicResearchResult>(key);
    if (cached) {
      topicResearch = cached;
    } else {
      try {
        topicResearch = await searchTopicPosts({
          topics,
          days: topicDays,
          perTopicResults: quick ? Math.min(topicMaxResults, 10) : topicMaxResults,
          performantLikeThreshold,
          maxTopicSearchAttempts,
          combineTopicCalls: !splitTopicCalls,
        });
        writeCache(key, topicResearch, ttlMs);
      } catch (err) {
        topicResearch = {
          meta: {
            auth_mode: "bearer",
            days: topicDays,
            start_time: "",
            per_topic_results: topicMaxResults,
            topic_count: topics.length,
            note: "Topic research failed.",
            error: err instanceof Error ? err.message : "Unknown topic research error.",
          },
          topics: {},
        };
      }
    }
  }

  let trends: TrendsResult | null = null;
  if (!noTrends) {
    const trendsKey = cacheKey(["trends-v2", trendsWoeid, trendsLimit]);
    const cachedTrends = readCache<TrendsResult>(trendsKey);
    if (cachedTrends) {
      trends = cachedTrends;
    } else {
      trends = await fetchTrendsByWoeid({
        woeid: trendsWoeid,
        limit: trendsLimit,
      });
      writeCache(trendsKey, trends, 60 * 60 * 1000);
    }
  }

  const output = generateAdvice({
    draft: draftText,
    posts,
    topics,
    topicResearch,
    trends,
    accountFetchError,
  });

  if (save || markdownOut) {
    const outPath = writeMarkdownOutput(output, markdownOut || undefined);
    process.stdout.write(`${output}\n\nSaved: ${outPath}\n`);
    return;
  }
  process.stdout.write(`${output}\n`);
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  bootstrapEnv(flags);
  if (command === "fetch") return cmdFetch(flags);
  if (command === "research") return cmdResearch(flags);
  if (command === "advise") return cmdAdvise(flags);
  printHelp();
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
});
