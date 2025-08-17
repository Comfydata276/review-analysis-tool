"""SQLite-backed local search helper using FTS5.

Provides a simple function `search_local_apps(query, start, count)` which returns
a tuple `(games, total)` where `games` is a list of {app_id, name} dicts and
`total` is an integer representing the number of matches (best-effort).

This module intentionally removes Python-side fuzzy scoring and relies only on
exact AppID lookup, FTS5 prefix matches, and case-insensitive substring LIKE
matches.
"""
from typing import List, Tuple, Dict
import sqlite3
import re

from .config import settings


DB_PATH = settings.DATABASE_URL.replace("sqlite:///", "")


def _connect():
	conn = sqlite3.connect(DB_PATH)
	conn.row_factory = sqlite3.Row
	return conn


def _normalize_text(s: str) -> str:
	# Lowercase and strip non-alphanumeric characters for robust matching
	return re.sub(r"[^a-z0-9\s]", "", (s or "").lower())


def _rows_to_games(rows: List[sqlite3.Row], limit: int = None) -> List[Dict]:
	"""Convert sqlite rows to simple game dicts and optionally limit.

	This is a deterministic conversion: preserve ordering from the SQL query
	(which should include desired ordering) and produce simple {app_id, name}
	dicts.
	"""
	games: List[Dict] = []
	for r in rows:
		# support both sqlite3.Row with keys and tuple-style rows
		if hasattr(r, "keys"):
			# sqlite3.Row supports mapping access via keys() and indexing but does
			# not implement `get()`. Use explicit key checks to be safe.
			row_keys = list(r.keys())
			if "app_id" in row_keys:
				app_id_val = r["app_id"]
			elif "rowid" in row_keys:
				app_id_val = r["rowid"]
			else:
				app_id_val = r[0]
			name_val = r["name"] if "name" in row_keys else r[1]
		else:
			app_id_val = r[0]
			name_val = r[1]
		games.append({"app_id": int(app_id_val), "name": name_val})
	if limit:
		games = games[:limit]
	return games


def search_local_apps(query: str, start: int = 0, count: int = 200) -> Tuple[List[Dict], int]:
	"""Search the local `steam_apps_fts` FTS5 table for `query`.

	Behavior:
	- Exact AppID lookup if query is numeric.
	- FTS5 prefix match on normalized query (preferred).
	- Case-insensitive substring LIKE on `steam_apps.name` as fallback.
	
	No Python fuzzy scoring is performed.
	"""
	q = (query or "").strip()
	if not q:
		return ([], 0)

	conn = _connect()
	try:
		cur = conn.cursor()

		# If the query is numeric, treat it as an AppID lookup and return exact matches
		if q.isdigit():
			try:
				app_id = int(q)
				cur.execute(
					"SELECT app_id, name FROM steam_apps WHERE app_id = ? LIMIT ?",
					(app_id, count),
				)
				rows = cur.fetchall()
				if rows:
					games = _rows_to_games(rows, limit=count)
					try:
						cur.execute("SELECT COUNT(*) FROM steam_apps WHERE app_id = ?", (app_id,))
						total = int(cur.fetchone()[0] or 0)
					except Exception:
						total = len(games)
					return (games, total)
			except Exception:
				# If something goes wrong with AppID lookup, continue with other strategies
				pass

		# Normalize query for token-like matching (remove punctuation)
		norm_q = _normalize_text(q)

		# Prefer FTS5 prefix matching on the normalized query
		if norm_q:
			fts_query = f"{norm_q}*"
		else:
			fts_query = f"{q}*"

		try:
			cur.execute(
				"SELECT rowid, name FROM steam_apps_fts WHERE name MATCH ? LIMIT ? OFFSET ?",
				(fts_query, count, start),
			)
			rows = cur.fetchall()
		except Exception:
			# In case FTS is not configured or MATCH fails, fall through to LIKE
			rows = []

		if rows:
			games = _rows_to_games(rows, limit=count)
			# Estimate total using COUNT on FTS (best-effort)
			try:
				cur.execute("SELECT COUNT(*) as c FROM steam_apps_fts WHERE name MATCH ?", (fts_query,))
				total = int(cur.fetchone()[0] or 0)
			except Exception:
				total = len(games)
			return (games, total)

		# Substring LIKE search on main table (case-insensitive)
		like_q = f"%{norm_q or q}%"
		cur.execute(
			"SELECT app_id, name FROM steam_apps WHERE lower(name) LIKE ? LIMIT ? OFFSET ?",
			(like_q, count, start),
		)
		rows = cur.fetchall()
		if rows:
			games = _rows_to_games(rows, limit=count)
			try:
				cur.execute("SELECT COUNT(*) FROM steam_apps WHERE lower(name) LIKE ?", (like_q,))
				total = int(cur.fetchone()[0] or 0)
			except Exception:
				total = len(games)
			return (games, total)

		# No matches found
		return ([], 0)
	finally:
		conn.close()


