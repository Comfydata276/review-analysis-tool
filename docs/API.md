
# Review Analysis Tool — API Documentation

This document provides a reference for the backend HTTP API (FastAPI).

Base URL (development): `http://127.0.0.1:8000`

Each endpoint below lists method(s), path, parameters/payload, a short description and an example use-case.

## Games

- **GET /games/search?query=...&start=&count=**
  - Description: Real-time search against Steam's store search. Returns a paginated `GameSearchResponse` with `games`, `total`, `start`, `count`.
  - Query params: `query` (required), `start` (default 0), `count` (default 50, max 1000).
  - Use case: Live search box when the user types a game name.

- **GET /games/search_local?query=...&start=&count=**
  - Description: Search the locally backfilled applist (FTS5) for fast offline-capable autocomplete.
  - Use case: UI suggestions backed by the local DB.

- **GET /games/applist**
  - Description: Fetch full Steam applist from Steam (returns array of simple game objects {app_id, name}). Intended for backfill/import.
  - Use case: Seed the local applist on first-run or manual refresh.

- **GET /games/applist/stats**
  - Description: Return simple stats about local applist (count, last_seen) for monitoring/backfill status.

- **GET /games/backfill/status**
  - Description: Status of the background backfill service.

- **POST /games/backfill/start**
  - Description: Start the background applist backfill job.

- **GET /games/active**
  - Description: Return tracked/active games stored in the DB.

- **POST /games/active**
  - Description: Add a game to the tracked list. Body: `GameCreate` JSON `{ "app_id": 1716740, "name": "Starfield" }`.

- **DELETE /games/active/{app_id}**
  - Description: Remove an active game and its cached reviews (returns 204).

- **GET /games/steam_reviews/{app_id}**
  - Description: Query Steam for the reported total review count for an `app_id`. Returns `{ "app_id": <id>, "steam_total_reviews": <count> }`.

## Scraper

- **POST /scraper/start** (status 202)
  - Description: Start a background scraping job. Accepts a JSON payload describing global settings and per-game overrides.
  - Example payload:

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

  - Use case: User triggers scraping of tracked games from the UI.

- **POST /scraper/stop**
  - Description: Signal the running scraper to stop gracefully after the current request.

- **GET /scraper/status**
  - Description: Returns progress, current game, per-game progress and logs for UI monitoring.

## Reviews

- **GET /reviews/**
  - Description: List reviews with optional filters. Returns a `ReviewPage` object with `reviews`, `total`, `limit`, `offset`.
  - Query params: `app_id`, `start_date` (YYYY-MM-DD), `end_date`, `review_type` (positive|negative), `limit`, `offset`.

- **DELETE /reviews/by_game/{app_id}?dry_run=true|false**
  - Description: Delete reviews for an app. If `dry_run=true`, returns the number of reviews that would be deleted without performing deletion.

- **GET /reviews/export/{app_id}?format=csv|xlsx**
  - Description: Export all reviews for an `app_id` as CSV (default) or XLSX. Returns a file attachment.
  - Use case: Download review dataset for offline analysis.

- **GET /reviews/count/{app_id}**
  - Description: Return the number of reviews stored in the DB for the `app_id`.

## Analysis

- **POST /analysis/preview**
  - Description: Return a preview sample of reviews that match supplied analysis filters (does not call LLMs). Accepts a JSON payload with filter keys similar to the `/reviews` endpoint and returns a `ReviewPage`.
  - Use case: Let user confirm filters before running an LLM-backed analysis.

## Prompts (LLM prompt files)

Prompts are stored on disk under the directory configured by the `PROMPTS_DIR` env var (default `./prompts`). The frontend interacts with these endpoints to list, edit, upload, delete and select the active prompt.

- **GET /prompts/**
  - Description: List available prompt files. Returns `string[]`.

- **GET /prompts/{name}**
  - Description: Download the prompt file `{name}` as plain text. Responses set `Cache-Control: no-store` to avoid stale client caching.

- **POST /prompts/{name}**
  - Description: Save/overwrite `{name}`. Expect `multipart/form-data` with a `file` field. The backend writes files atomically (write temp then replace) to avoid partial writes.
  - Client example (JS):

```js
const form = new FormData();
form.append('file', new Blob([content], { type: 'text/plain' }), filename);
fetch(`${BASE_URL}/prompts/${encodeURIComponent(filename)}`, { method: 'POST', body: form });
```

- **POST /prompts/upload**
  - Description: Upload a new prompt file via `multipart/form-data` with field `file`. Returns `{ "ok": true, "filename": "..." }`.

- **DELETE /prompts/{name}**
  - Description: Delete a prompt file. Returns `{ "ok": true }` on success.
  - Note: The UI guards the built-in `prompt.txt` by default but the backend allows deletion if requested.

- **GET /prompts/active**
  - Description: Retrieve the currently active prompt name. Returns `{ "active": "prompt.txt" }`.

- **POST /prompts/active**
  - Description: Set the active prompt via JSON body `{ "name": "my_prompt.txt" }`.

- **POST /prompts/active/{name}** (also accepts PUT)
  - Description: Convenience endpoint to set the active prompt using the path parameter (no body required). Frontend uses this to avoid content-type/body parsing issues.
  - Example: `POST /prompts/active/custom_prompt.txt`.

## Settings

- **GET /settings/scraper**
  - Description: Get saved scraper UI settings (stored as JSON under `scraper:settings`).

- **POST /settings/scraper**
  - Description: Persist scraper settings (JSON payload stored under `scraper:settings`).

- **DELETE /settings/scraper**
  - Description: Delete saved scraper settings.

- **GET /settings/analysis**, **POST /settings/analysis**, **DELETE /settings/analysis**
  - Description: Same CRUD operations for analysis UI settings under `analysis:settings`.

## Notes and examples

- Prompts: the backend disables caching and writes files atomically to prevent stale reads or partial files.

- To set the active prompt (frontend-friendly):

```js
fetch(`${BASE_URL}/prompts/active/${encodeURIComponent(name)}`, { method: 'POST' });
```

- To save a prompt from the frontend (multipart form):

```js
const form = new FormData();
form.append('file', new Blob([content], { type: 'text/plain' }), filename);
await fetch(`${BASE_URL}/prompts/${encodeURIComponent(filename)}`, { method: 'POST', body: form });
```

- Review export example:

```
GET /reviews/export/1716740?format=csv
```


## Response schemas (examples)

Below are example response bodies for the main endpoints. These are illustrative and show the typical JSON shape returned by the API.

- GameSearchResponse (`GET /games/search`)

```json
{
  "games": [
    { "app_id": 1716740, "name": "Starfield" }
  ],
  "total": 1,
  "start": 0,
  "count": 50
}
```

- GameRead / GameCreate (single game)

```json
{ "app_id": 1716740, "name": "Starfield" }
```

- Review (single review) — fields returned by `/reviews` and used in exports

```json
{
  "review_id": 1234567890,
  "app_id": 1716740,
  "review_date": "2025-08-20T12:34:56Z",
  "review_text": "I enjoyed this game...",
  "review_type": "positive",
  "language": "english",
  "playtime_hours": 12.5,
  "early_access": false,
  "received_for_free": false,
  "timestamp_updated": "2025-08-21T10:00:00Z",
  "votes_helpful": 5,
  "weighted_vote_score": 0.75,
  "comment_count": 0,
  "author_num_games_owned": 20,
  "author_num_reviews": 3,
  "author_playtime_last_two_weeks": 2,
  "author_last_played": "2025-08-19T08:00:00Z",
  "steam_purchase": true,
  "scraped_at": "2025-08-21T11:00:00Z"
}
```

- ReviewPage (`GET /reviews` / `POST /analysis/preview`)

```json
{
  "reviews": [ /* array of Review objects */ ],
  "total": 1234,
  "limit": 100,
  "offset": 0
}
```

- Scraper status (`GET /scraper/status`)

```json
{
  "is_running": true,
  "current_game": "Game Name",
  "current_game_progress": { "scraped": 120, "total": 1000, "eta_seconds": 3600 },
  "global_progress": { "scraped": 240, "total": 10000, "eta_seconds": 36000 },
  "logs": ["Started scraping...", "Fetched page 1"]
}
```

- Prompts endpoints

GET /prompts/

```json
["prompt.txt", "Temp", "custom_prompt.txt"]
```

GET /prompts/{name}

- Returns plain text (Content-Type: text/plain) containing the prompt source.

POST /prompts/{name}

```json
{ "ok": true }
```

POST /prompts/upload

```json
{ "ok": true, "filename": "imported_prompt.txt" }
```

DELETE /prompts/{name}

```json
{ "ok": true }
```

GET /prompts/active

```json
{ "active": "prompt.txt" }
```

POST /prompts/active or POST /prompts/active/{name}

```json
{ "ok": true }
```

- Settings endpoints (example)

GET /settings/scraper

```json
{ "rate_limit_rpm": 60, "max_reviews": 1000 }
```

POST /settings/scraper

```json
{ "ok": true }
```

## Notes

- File-download endpoints (review export, prompt GET) return a file attachment (CSV/TXT/XLSX) with an appropriate `Content-Disposition` header instead of JSON.
- The examples above show typical shapes; refer to the router implementations in `backend/routers/` for any additional fields or version-specific details.

