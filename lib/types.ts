export type AuthMode = "oauth1" | "bearer";

export interface PublicMetrics {
  like_count?: number;
  retweet_count?: number;
  reply_count?: number;
  quote_count?: number;
  impression_count?: number;
}

export interface NonPublicMetrics {
  impression_count?: number;
}

export interface Post {
  id?: string;
  text?: string;
  created_at?: string;
  author_id?: string;
  public_metrics?: PublicMetrics;
  non_public_metrics?: NonPublicMetrics;
}

export interface FetchRecentPostsResult {
  meta: {
    days: number;
    start_time: string;
    auth_mode: AuthMode;
    username?: string;
    user_id: string;
    post_count: number;
  };
  data: Post[];
  raw_meta?: Record<string, unknown>;
}

export interface TopicResearchResult {
  meta: {
    auth_mode: AuthMode;
    days: number;
    start_time: string;
    per_topic_results: number;
    topic_count: number;
    note: string;
    api_calls_estimate?: number;
    est_cost_usd?: number;
    attempts_used?: number;
    performant_like_threshold?: number;
    strategy?: string;
    cached?: boolean;
    cache_key?: string;
    error?: string;
  };
  topics: Record<string, Post[]>;
}

export interface TrendItem {
  name: string;
  post_count?: number;
}

export interface TrendsResult {
  meta: {
    woeid: number;
    trend_count: number;
    note: string;
    error?: string;
  };
  trends: TrendItem[];
}
