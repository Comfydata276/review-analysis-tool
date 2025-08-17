# Steam Review Scraper + LLM Analysis Tool

## Overview

This is a **desktop-first research tool** for scraping and analysing Steam user
reviews. It is designed for academic research (Honours + PhD) to test the
viability of using Large Language Models (LLMs) for review analysis.

The application consists of:

- **Frontend**: Electron + React (modern, cross-platform desktop UI)
- **Backend**: Python + FastAPI (scraping, analysis, database storage)
- **Database**: SQLite (local-first, portable, reproducible)

---

## Features (Planned)

### Chunk 1 — Steam API Scraper + UI
- Search for games by name or AppID
- Maintain a persistent "active list" of games to scrape
- Configurable scraping settings:
  - Number of reviews to scrape (global + per-game overrides)
  - API rate limit
  - Language filter (English default)
  - Date range (absolute start/end)
  - Early access filter (include/exclude/only)
  - Received for free filter (include/exclude/only)
- Per-game and global progress bars
- ETA calculation
- Live log output
- Graceful stop/resume
- All reviews stored in SQLite

### Future Chunks
- LLM analysis pipeline (cloud + local models)
- Multi-LLM comparison
- Thematic analysis dashboard
- Export to CSV, Excel, JSON
- Ethics & reproducibility features

---

## Tech Stack

**Frontend**
- Electron
- React
- TailwindCSS (UI styling)
- Axios (API calls to backend)

**Backend**
- Python 3.11+
- FastAPI
- SQLite + SQLAlchemy
- `httpx` (Steam API calls)
- `pydantic` (data validation)

**LLM Integration (future)**
- OpenAI SDK
- Google Generative AI SDK
- OpenRouter API
- Ollama Python API

---

## Project Structure
steam-review-scraper/
│
├── backend/                # FastAPI backend
│   ├── main.py              # FastAPI entry point
│   ├── api/                 # API route definitions
│   ├── services/            # Scraper, LLM analysis, etc.
│   ├── models/              # SQLAlchemy models
│   ├── schemas/             # Pydantic schemas
│   ├── db.py                # Database connection
│   └── requirements.txt     # Python dependencies
│
├── frontend/                # Electron + React frontend
│   ├── public/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── pages/           # Game selector, scraper page
│   │   ├── api/             # Axios API calls
│   │   └── App.jsx
│   ├── package.json
│   └── tailwind.config.js
│
├── README.md
└── .gitignore

---

## Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/steam-review-scraper.git
cd steam-review-scraper

### 2. Backend Setup (FastAPI)
cd backend
python -m venv venv
source venv/bin/activate   # On Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload

### 3. Frontend Setup (Electron + React)
cd frontend
npm install
npm run dev

---

## API Reference

Base URL (development): `http://127.0.0.1:8000`

### Games
- `GET /games/search?query=...` — Search Steam in real-time. Use this to find app IDs or game names.
- `GET /games/active` — List active (tracked) games stored in the DB.
- `POST /games/active` — Add an active game to the DB. Body: `{ "app_id": <int>, "name": "<string>" }`
- `DELETE /games/active/{app_id}` — Remove a tracked game (also deletes its reviews via cascade).

### Scraper
- `POST /scraper/start` — Start the scraper. JSON payload:

```json
{
  "global_settings": {
    "max_reviews": 1000,
    "rate_limit_rpm": 60,
    "language": "english",
    "start_date": "2025-01-01",    // optional YYYY-MM-DD
    "end_date": "2025-08-01",      // optional YYYY-MM-DD (inclusive)
  },
  "per_game_overrides": {
    "1716740": { "max_reviews": 500 }
  }
}
```

- `POST /scraper/stop` — Signal the scraper to stop after finishing the current request.
- `GET /scraper/status` — Get progress and logs for the running scraper.

### Reviews
- `GET /reviews/` — List reviews. Query params:
  - `app_id` (int)
  - `start_date` (YYYY-MM-DD)
  - `end_date` (YYYY-MM-DD)
  - `review_type` (`positive`|`negative`)
  - `limit` (int)
  - `offset` (int)

  Returns JSON: `{ "reviews": [...], "total": <int>, "limit": <int>, "offset": <int> }`

- `DELETE /reviews/by_game/{app_id}?dry_run=true|false` — Delete all reviews for `app_id`. If `dry_run=true` (default false), the endpoint returns the number that would be deleted without performing deletion.

### Examples

- Delete all reviews for Starfield (dry run):
  - `GET http://127.0.0.1:8000/reviews/by_game/1716740?dry_run=true`
- Delete all reviews for Starfield (perform):
  - `DELETE http://127.0.0.1:8000/reviews/by_game/1716740`

---

If you want, I can add example curl/Postman requests, or expand the README with a `scripts` section to start both frontend/backend together.