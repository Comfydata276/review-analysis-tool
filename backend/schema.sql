-- SQLite schema for local Steam app corpus
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

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


