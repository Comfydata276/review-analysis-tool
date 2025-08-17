# Review Analysis Tool — API Documentation

This document provides a detailed API reference for the backend service (FastAPI).

Base URL (development): `http://127.0.0.1:8000`

## Games

- GET /games/search?query=... — Search Steam in real-time. Use text or an AppID.

- GET /games/active — List active (tracked) games stored in the DB. Returns `GameRead` objects.

- POST /games/active — Add a game to the tracked list.
  - Body: `GameCreate` JSON: `{ "app_id": 1716740, "name": "Starfield" }`

- DELETE /games/active/{app_id} — Remove an active game and its cached reviews.

## Scraper

- POST /scraper/start — Start the background scraper.
  - JSON payload shape:

```json
{
  "global_settings": {
    "max_reviews": 1000,
    "rate_limit_rpm": 60,
    "language": "english",
    "start_date": "2025-01-01",
    "end_date": "2025-08-01",
    "early_access": "include",
    "received_for_free": "include"
  },
  "per_game_overrides": {
    "1716740": { "max_reviews": 500 }
  }
}
```

- POST /scraper/stop — Signal the running scraper to stop after the current request completes.

- GET /scraper/status — Returns progress and logs. Useful for UIs and monitoring.

## Reviews

- GET /reviews/ — List reviews with filters
  - Query params: `app_id`, `start_date`, `end_date`, `review_type` (positive|negative), `limit`, `offset`
  - Response: `ReviewPage` (reviews, total, limit, offset)

- DELETE /reviews/by_game/{app_id}?dry_run=true|false — Delete reviews for `app_id`. If `dry_run` the endpoint returns count without deleting.

## Cursors

To reduce duplicate pages and allow efficient resume, the scraper persists cursors per (app_id + run-params hash).

- GET /reviews/cursors?app_id=&params_hash= — List stored cursors.
- DELETE /reviews/cursors?app_id=&params_hash= — Delete stored cursors for an app / params.

## Notes on usage

- Use `start_date` when you want to limit the scrape window. If omitted, the scraper tries to resume intelligently by counting existing reviews and using saved cursors.
- When re-running scrapes with the same parameters, the scraper will try newest-first and then use the saved cursor if duplicate pages are detected.


