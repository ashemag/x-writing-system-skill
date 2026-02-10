# X API Notes for This Skill

This skill reads posts from the user's timeline and ranks top performers for writing guidance.

## Endpoints

- `GET /2/users/by/username/:username` to resolve user id
- `GET /2/users/:id/tweets` to fetch recent posts

## Time Window

Use `start_time` with an ISO timestamp computed as:

- `start_time = now_utc - 30 days`

The CLI computes this automatically.

## Metrics

For ranking, the skill reads:

- `non_public_metrics.impression_count` (when available)
- `public_metrics.like_count`
- `public_metrics.retweet_count`

## Auth

Preferred default:

- OAuth 1.0a user context via:
  - `X_API_KEY`
  - `X_API_KEY_SECRET`
  - `X_ACCESS_TOKEN`
  - `X_ACCESS_TOKEN_SECRET`

Fallback:

- `X_BEARER_TOKEN` for public metrics-only fetches.
