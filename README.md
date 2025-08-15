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