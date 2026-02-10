# X API Notes for This Skill

This skill reads posts from the user's timeline, runs topic research, and checks trends overlap.

## Endpoints

- `GET /2/users/by/username/:username` to resolve user id
- `GET /2/users/:id/tweets` to fetch recent posts
- `GET /2/tweets/search/recent` to fetch topic-related posts for market learnings
- `GET /2/trends/by/woeid/:woeid` to fetch trend candidates for overlap scoring

## Time Window

Use `start_time` with an ISO timestamp computed as:

- `start_time = now_utc - 30 days`

The CLI computes this automatically.

## Metrics

For ranking, the skill reads:

- `non_public_metrics.impression_count` (when available)
- `public_metrics.like_count`
- `public_metrics.retweet_count`
- `public_metrics.reply_count`
- `public_metrics.quote_count`

## Auth

Recommended default:

- Bearer token auth via `X_BEARER_TOKEN`

Optional:

- OAuth 1.0a user context via:
  - `X_API_KEY`
  - `X_API_KEY_SECRET`
  - `X_ACCESS_TOKEN`
  - `X_ACCESS_TOKEN_SECRET`

## Topic Search Notes

- Topic research uses the recent search endpoint and ranks by public engagement.
- Combined adaptive queries are used by default to reduce API calls.
- Query excludes retweets (and usually replies) to bias toward authored posts.
- Topic search insights are directional and should be combined with your own-account performance data.
