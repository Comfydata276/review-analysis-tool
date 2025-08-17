"""Background backfill service to populate the local SQLite applist with progress tracking.

This is used for non-blocking first-run population. It mirrors the logic in
`backend/tools/fetch_applist.py` but updates an in-memory progress object that can
be read by an API endpoint.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Iterable, List, Dict, Optional

import requests

from .config import settings


class BackfillStatus:
    def __init__(self) -> None:
        self.state: str = "idle"  # idle | running | done | failed
        self.total: int = 0
        self.processed: int = 0
        self.started_at: Optional[str] = None
        self.finished_at: Optional[str] = None
        self.error: Optional[str] = None


class BackfillService:
    def __init__(self, batch: int = 1000) -> None:
        self.status = BackfillStatus()
        self._thread: Optional[threading.Thread] = None
        self._batch = batch

    def start_background(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def _db_path(self) -> str:
        # settings.DATABASE_URL like sqlite:///./app.db
        return settings.DATABASE_URL.replace("sqlite:///", "")

    def _schema_path(self) -> str:
        return str(Path(__file__).resolve().parent / "schema.sql")

    def _init_db(self, conn: sqlite3.Connection) -> None:
        schema_file = Path(__file__).resolve().parent / "schema.sql"
        if schema_file.exists():
            with open(schema_file, "r", encoding="utf-8") as f:
                conn.executescript(f.read())

    def _upsert_batch(self, conn: sqlite3.Connection, rows: Iterable[dict]) -> None:
        cur = conn.cursor()
        cur.executemany(
            "INSERT INTO steam_apps(app_id, name, raw, last_seen) VALUES (?, ?, ?, datetime('now')) "
            "ON CONFLICT(app_id) DO UPDATE SET name=excluded.name, raw=excluded.raw, last_seen=datetime('now')",
            [(r["app_id"], r["name"], json.dumps(r)) for r in rows],
        )
        conn.commit()

    def _populate_fts(self, conn: sqlite3.Connection) -> None:
        cur = conn.cursor()
        cur.execute("DELETE FROM steam_apps_fts;")
        cur.execute("INSERT INTO steam_apps_fts(rowid, name) SELECT app_id, name FROM steam_apps;")
        conn.commit()

    def _fetch_applist(self) -> List[Dict]:
        url = f"{settings.STEAM_API_BASE_URL}/ISteamApps/GetAppList/v2/"
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json() or {}
        apps = data.get("applist", {}).get("apps", []) or []
        results: List[Dict] = []
        for e in apps:
            appid = e.get("appid") or e.get("appID")
            name = (e.get("name") or "").strip()
            if appid is not None and name:
                results.append({"app_id": int(appid), "name": name})
        return results

    def _run(self) -> None:
        self.status.state = "running"
        self.status.started_at = datetime.utcnow().isoformat() + "Z"
        self.status.processed = 0
        self.status.error = None
        try:
            apps = self._fetch_applist()
            self.status.total = len(apps)
            db_path = self._db_path()
            conn = sqlite3.connect(db_path)
            try:
                self._init_db(conn)
                batch: List[Dict] = []
                for a in apps:
                    batch.append(a)
                    if len(batch) >= self._batch:
                        self._upsert_batch(conn, batch)
                        self.status.processed += len(batch)
                        batch = []
                    # small sleep to allow status reads during long runs
                    time.sleep(0)
                if batch:
                    self._upsert_batch(conn, batch)
                    self.status.processed += len(batch)
                # populate FTS
                try:
                    self._populate_fts(conn)
                except sqlite3.DatabaseError as e:
                    # Database appears corrupted. Move corrupt DB aside and recreate from fetched apps.
                    try:
                        conn.close()
                    except Exception:
                        pass
                    try:
                        corrupt_path = Path(self._db_path()).with_suffix('.corrupt.' + datetime.utcnow().strftime('%Y%m%d%H%M%S'))
                        os.replace(self._db_path(), str(corrupt_path))
                    except Exception as mv_ex:
                        # If move fails, surface error and stop
                        self.status.state = "failed"
                        self.status.error = f"Failed to move corrupt DB: {mv_ex}"
                        self.status.finished_at = datetime.utcnow().isoformat() + "Z"
                        return
                    # Recreate DB from apps list
                    try:
                        conn = sqlite3.connect(self._db_path())
                        self._init_db(conn)
                        batch: List[Dict] = []
                        for a in apps:
                            batch.append(a)
                            if len(batch) >= self._batch:
                                self._upsert_batch(conn, batch)
                                self.status.processed += len(batch)
                                batch = []
                        if batch:
                            self._upsert_batch(conn, batch)
                            self.status.processed += len(batch)
                        # attempt populate again
                        self._populate_fts(conn)
                    except Exception as rec_ex:
                        self.status.state = "failed"
                        self.status.error = f"Failed to recreate DB after corruption: {rec_ex}"
                        self.status.finished_at = datetime.utcnow().isoformat() + "Z"
                        try:
                            conn.close()
                        except Exception:
                            pass
                        return
                # Meili sync removed; no-op.
            finally:
                conn.close()
            self.status.state = "done"
            self.status.finished_at = datetime.utcnow().isoformat() + "Z"
        except Exception as e:
            self.status.state = "failed"
            self.status.error = str(e)
            self.status.finished_at = datetime.utcnow().isoformat() + "Z"


_default_service: Optional[BackfillService] = None


def get_default_service() -> BackfillService:
    global _default_service
    if _default_service is None:
        _default_service = BackfillService()
    return _default_service


