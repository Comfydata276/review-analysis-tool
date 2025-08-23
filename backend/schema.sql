-- SQLite schema for local Steam app corpus
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

-- Ensure legacy cursor table (if present) is removed when initializing a fresh DB
DROP TABLE IF EXISTS scrape_cursors;

CREATE TABLE IF NOT EXISTS steam_apps (
    app_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    release_date TEXT,
    platforms JSON,
    genres JSON,
    raw JSON,
    last_seen TEXT DEFAULT (datetime('now'))
);

-- FTS5 virtual table for fast name search / prefix matching
CREATE VIRTUAL TABLE IF NOT EXISTS steam_apps_fts USING fts5(
    name,
    content='steam_apps',
    content_rowid='app_id',
    tokenize = 'unicode61'
);



-- Analysis job and results tables
CREATE TABLE IF NOT EXISTS analysis_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    app_id INTEGER,
    settings TEXT,
    provider_list TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    total_reviews INTEGER NOT NULL DEFAULT 0,
    processed_count INTEGER NOT NULL DEFAULT 0,
    started_at TEXT,
    completed_at TEXT,
    error TEXT
);

CREATE TABLE IF NOT EXISTS analysis_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    app_id INTEGER,
    game_name TEXT,
    review_id TEXT,
    review_text_snapshot TEXT,
    llm_provider TEXT NOT NULL,
    model TEXT NOT NULL,
    reasoning_effort TEXT,
    prompt_used TEXT,
    analysis_output TEXT,
    analysed_review TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT,
    FOREIGN KEY(job_id) REFERENCES analysis_jobs(id) ON DELETE CASCADE,
    FOREIGN KEY(review_id) REFERENCES steam_reviews(review_id)
);


CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    name TEXT,
    encrypted_key TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    notes TEXT
);