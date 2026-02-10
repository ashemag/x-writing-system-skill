import type { Post, TopicResearchResult, TrendsResult } from "./types";
import { MATT_GRAY_X_WRITING_GUIDELINES } from "./guidelines";

type Metrics = {
  impressions: number;
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
};

type ScoredPost = {
  id: string;
  text: string;
  score: number;
  metrics: Metrics;
};

function metrics(post: Post): Metrics {
  const pub = post.public_metrics ?? {};
  const non = post.non_public_metrics ?? {};
  return {
    impressions: Number(non.impression_count ?? pub.impression_count ?? 0),
    likes: Number(pub.like_count ?? 0),
    reposts: Number(pub.retweet_count ?? 0),
    replies: Number(pub.reply_count ?? 0),
    quotes: Number(pub.quote_count ?? 0),
  };
}

function rankOwned(posts: Post[], topN = 10): ScoredPost[] {
  return posts
    .map((post) => {
      const m = metrics(post);
      const score = m.impressions + m.likes * 20 + m.reposts * 30 + m.replies * 12 + m.quotes * 18;
      return {
        id: post.id ?? "",
        text: (post.text ?? "").trim(),
        score,
        metrics: m,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

function rankTopic(posts: Post[], topN = 2): ScoredPost[] {
  return posts
    .map((post) => {
      const m = metrics(post);
      const score = m.likes + m.reposts * 2 + m.replies * 1.5 + m.quotes * 2;
      return {
        id: post.id ?? "",
        text: (post.text ?? "").trim(),
        score,
        metrics: m,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

export function extractTopics(draft: string, maxTopics = 5): string[] {
  const hashTags = [...draft.matchAll(/#([a-zA-Z0-9_]{2,40})/g)].map((m) => `#${m[1].toLowerCase()}`);
  const words = [...draft.toLowerCase().matchAll(/[a-z][a-z0-9-]{2,30}/g)].map((m) => m[0]);
  const stop = new Set([
    "this",
    "that",
    "your",
    "with",
    "from",
    "what",
    "when",
    "where",
    "they",
    "them",
    "have",
    "just",
    "like",
    "more",
    "most",
    "only",
    "very",
    "then",
    "than",
    "about",
    "into",
    "over",
    "because",
  ]);
  const freq = new Map<string, number>();
  for (const w of words) {
    if (stop.has(w)) continue;
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([w]) => w);
  const merged: string[] = [];
  for (const t of [...hashTags, ...topWords]) {
    if (!merged.includes(t)) merged.push(t);
  }
  return merged.slice(0, maxTopics);
}

function guidelineGaps(draft: string): string[] {
  const cleanLines = draft.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const gaps: string[] = [];
  if (cleanLines.length === 0) return ["Draft is empty."];
  if (cleanLines[0].split(/\s+/).length > 14) gaps.push("Hook is long; tighten into a high-contrast first line.");
  if (!/\d/.test(draft)) gaps.push("Add numbers, examples, or outcomes to increase specificity.");
  if (cleanLines.length < 3) gaps.push("Improve spacing with short, skimmable lines.");
  if (!/(reply|follow|bookmark|click|\?)/i.test(draft)) gaps.push("Add a direct CTA.");
  if (!/(how to|step|template|example)/i.test(draft)) gaps.push("Add tactical HOW detail or a mini-template.");
  return gaps;
}

function compact(text: string, maxLen = 180): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 1).trim()}…`;
}

function textTokens(input: string): Set<string> {
  const cleaned = input.toLowerCase().replace(/[^a-z0-9\s#]/g, " ");
  return new Set(
    cleaned
      .split(/\s+/)
      .map((t) => t.trim().replace(/^#/, ""))
      .filter((t) => t.length >= 3)
  );
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const v of a) {
    if (b.has(v)) inter += 1;
  }
  return inter / Math.max(1, Math.min(a.size, b.size));
}

function closestTrends(args: {
  trends?: TrendsResult | null;
  topics: string[];
  draft: string;
  limit?: number;
}): string[] {
  const { trends, topics, draft } = args;
  const limit = Math.max(1, Math.min(args.limit ?? 3, 8));
  if (!trends) return ["- Trends lookup not run for this request."];
  if (trends.meta.error) return [`- Trends unavailable: ${trends.meta.error}`];
  if (!trends.trends.length) return ["- Trends endpoint returned no topics."];

  const context = textTokens([draft, ...topics].join(" "));
  const ranked = trends.trends
    .map((t) => {
      const tTokens = textTokens(t.name);
      const score = overlapScore(context, tTokens);
      return { trend: t, score };
    })
    .sort((a, b) => b.score - a.score || (b.trend.post_count ?? 0) - (a.trend.post_count ?? 0));

  const overlapOnly = ranked.filter((r) => r.score > 0).slice(0, limit);
  const selected = overlapOnly.length > 0 ? overlapOnly : ranked.slice(0, limit);

  const lines = selected.map((r) => {
    const count = typeof r.trend.post_count === "number" ? `, ${r.trend.post_count} posts` : "";
    const pct = `${Math.round(r.score * 100)}%`;
    return `- ${r.trend.name} (match: ${pct}${count})`;
  });
  if (overlapOnly.length === 0) {
    lines.push("- No direct keyword overlap detected in live trends for this WOEID/time window.");
  }
  return lines;
}

export function generateAdvice(args: {
  draft: string;
  posts: Post[];
  topics: string[];
  topicResearch?: TopicResearchResult | null;
  trends?: TrendsResult | null;
  accountFetchError?: string | null;
}): string {
  const topOwned = rankOwned(args.posts, 10);
  const performantThreshold = args.topicResearch?.meta?.performant_like_threshold ?? 50;
  const highPerformingSamples: string[] = [];
  const ownedWinners: string[] = [];
  const trendLines = closestTrends({
    trends: args.trends,
    topics: args.topics,
    draft: args.draft,
    limit: 3,
  });
  if (args.topicResearch?.meta?.error) {
    highPerformingSamples.push(`- Topic research unavailable: ${args.topicResearch.meta.error}`);
  } else if (args.topicResearch) {
    const aboveThresholdSamples: string[] = [];
    const fallbackSamples: string[] = [];
    for (const [topic, posts] of Object.entries(args.topicResearch.topics)) {
      const ranked = rankTopic(posts, 5);
      const aboveThreshold = ranked.filter((p) => p.metrics.likes > performantThreshold);
      for (const sample of aboveThreshold.slice(0, 2)) {
        aboveThresholdSamples.push(
          `- ${topic}: "${compact(sample.text)}" (${sample.metrics.likes} likes, ${sample.metrics.reposts} reposts, ${sample.metrics.replies} replies)`
        );
      }
      if (ranked[0]) {
        const sample = ranked[0];
        fallbackSamples.push(
          `- ${topic}: "${compact(sample.text)}" (${sample.metrics.likes} likes, ${sample.metrics.reposts} reposts, ${sample.metrics.replies} replies)`
        );
      }
    }
    if (aboveThresholdSamples.length > 0) {
      highPerformingSamples.push(...aboveThresholdSamples);
    } else if (fallbackSamples.length > 0) {
      highPerformingSamples.push(...fallbackSamples);
      highPerformingSamples.push(
        `- Note: no samples were above ${performantThreshold} likes in this pull, so showing best available matches.`
      );
    } else {
      highPerformingSamples.push(
        `- No >${performantThreshold}-like samples found in the current topic pull. Try broader topics or rerun after rate limits reset.`
      );
    }
  } else {
    highPerformingSamples.push("- No topic research data available for this run.");
  }

  if (args.accountFetchError) {
    ownedWinners.push(`- Personal post fetch degraded: ${args.accountFetchError}`);
  }
  if (topOwned.length === 0) {
    ownedWinners.push("- No personal posts were available for ranking in this run.");
  } else {
    for (const winner of topOwned.slice(0, 5)) {
      ownedWinners.push(
        `- "${compact(winner.text)}" (${winner.metrics.impressions} impressions, ${winner.metrics.likes} likes, ${winner.metrics.reposts} reposts, ${winner.metrics.replies} replies)`
      );
    }
  }

  const topMarketSignal =
    args.topicResearch && !args.topicResearch.meta.error
      ? Object.entries(args.topicResearch.topics)
          .map(([topic, posts]) => ({ topic, post: rankTopic(posts, 1)[0] }))
          .filter((x) => x.post)
          .sort((a, b) => (b.post!.metrics.likes || 0) - (a.post!.metrics.likes || 0))[0]
      : null;

  const topPersonal = topOwned[0] ?? null;
  const gaps = guidelineGaps(args.draft);
  const adviceItems: string[] = [];
  adviceItems.push(
    topMarketSignal
      ? `Lead with a sharper contrast in line 1. Market sample on "${topMarketSignal.topic}" that hit ${topMarketSignal.post!.metrics.likes} likes uses a concise, high-clarity opener before details.`
      : "Lead with a sharper contrast in line 1 and move context lines later; high-performing topic posts generally front-load a clearer hook."
  );
  adviceItems.push(
    topPersonal
      ? `Mirror your own winning structure: short line breaks + tactical specifics. Your top recent post (${topPersonal.metrics.impressions} impressions) suggests you perform better with compact formatting and concrete detail.`
      : "Use your writing-guide structure more explicitly: short lines, concrete specifics, and fewer abstract claims."
  );
  adviceItems.push(
    gaps[0]
      ? `Apply the writing guide directly: ${gaps[0]} Then end with a direct CTA and a punchy bar line.`
      : "Apply the writing guide directly: keep specificity high and end with a direct CTA + punchy bar line."
  );
  const guidelineLines = MATT_GRAY_X_WRITING_GUIDELINES.slice(0, 8).map((g) => `- ${g}`);

  return [
    "## Draft",
    args.draft.trim(),
    "",
    "## Matt Gray Writing Guidelines (Applied Baseline)",
    ...guidelineLines,
    "",
    "## Closest Trending Topics",
    ...trendLines,
    "",
    "## Topic Research (High-Performing Samples)",
    ...highPerformingSamples,
    "",
    "## Your Top Posts (Last 30 Days)",
    ...ownedWinners,
    "",
    "## 3 Specific Recommendations",
    `1) ${adviceItems[0]}`,
    `2) ${adviceItems[1]}`,
    `3) ${adviceItems[2]}`,
    "",
    "## LLM Writing Task",
    "- Use the evidence above to write 5 distinct improved X post versions.",
    "- Keep each version original (not templated), concise, and standalone.",
    "- Include a clear hook, tactical detail, and a direct CTA in each version.",
    "- Keep voice close to the original draft while increasing specificity and clarity.",
  ].join("\n");
}
