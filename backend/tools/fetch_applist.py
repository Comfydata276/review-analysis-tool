"""Simple backfill tool to fetch Steam app list and populate local SQLite DB.

Usage: python -m backend.tools.fetch_applist
"""
import json
import os
import sqlite3
import sys
from pathlib import Path
from typing import Iterable

import requests

# Get the project root directory (where app.db should be)
PROJECT_ROOT = Path(__file__).parent.parent.parent
DB_PATH = PROJECT_ROOT / "app.db"
SCHEMA_PATH = PROJECT_ROOT / "backend" / "schema.sql"
BATCH = 1000


def init_db(conn: sqlite3.Connection) -> None:
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        conn.executescript(f.read())


def upsert_batch(conn: sqlite3.Connection, rows: Iterable[dict]) -> None:
    cur = conn.cursor()
    cur.executemany(
        "INSERT INTO steam_apps(app_id, name, raw, last_seen) VALUES (?, ?, ?, datetime('now')) "
        "ON CONFLICT(app_id) DO UPDATE SET name=excluded.name, raw=excluded.raw, last_seen=datetime('now')",
        [(r["app_id"], r["name"], json.dumps(r)) for r in rows],
    )
    conn.commit()


def fetch_applist() -> list:
    url = "https://api.steampowered.com/ISteamApps/GetAppList/v2/"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json() or {}
    apps = data.get("applist", {}).get("apps", []) or []
    results = []
    for e in apps:
        appid = e.get("appid") or e.get("appID")
        name = (e.get("name") or "").strip()
        if appid is not None and name:
            results.append({"app_id": int(appid), "name": name})
    return results


def check_db_integrity(conn: sqlite3.Connection) -> bool:
    """Check if the database is corrupt."""
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA integrity_check;")
        result = cur.fetchone()
        return result and result[0] == "ok"
    except sqlite3.Error:
        return False


def backup_corrupt_db(db_path: Path) -> bool:
    """Backup a corrupt database file."""
    try:
        corrupt_path = db_path.with_suffix(db_path.suffix + ".corrupt")
        counter = 1
        while corrupt_path.exists():
            corrupt_path = db_path.with_suffix(f"{db_path.suffix}.corrupt.{counter}")
            counter += 1
        
        if db_path.exists():
            os.replace(str(db_path), str(corrupt_path))
            print(f"Moved corrupt DB to {corrupt_path}")
            return True
    except Exception as ex:
        print(f"Failed to backup corrupt DB: {ex}")
    return False


def populate_fts(conn: sqlite3.Connection) -> None:
    """Populate the FTS table with data from steam_apps table."""
    cur = conn.cursor()
    try:
        # Instead of DELETE + INSERT, use INSERT OR REPLACE in batches
        # First check if FTS table needs rebuilding
        cur.execute("SELECT COUNT(*) FROM steam_apps")
        apps_count = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM steam_apps_fts")
        fts_count = cur.fetchone()[0]
        
        if fts_count == apps_count:
            print(f"FTS table already up to date ({fts_count} records)")
            return
            
        # Drop and recreate FTS table to avoid corruption issues
        print("Rebuilding FTS table...")
        cur.execute("DROP TABLE IF EXISTS steam_apps_fts;")
        
        # Recreate FTS table
        cur.execute("""
            CREATE VIRTUAL TABLE steam_apps_fts USING fts5(
                name,
                content='steam_apps',
                content_rowid='app_id',
                tokenize = 'unicode61'
            );
        """)
        
        # Rebuild the FTS index
        cur.execute("INSERT INTO steam_apps_fts(steam_apps_fts) VALUES('rebuild');")
        conn.commit()
        
        # Verify the FTS table was populated
        cur.execute("SELECT COUNT(*) FROM steam_apps_fts")
        final_count = cur.fetchone()[0]
        print(f"Successfully populated FTS table with {final_count} records")
        
    except sqlite3.Error as e:
        print(f"Error populating FTS table: {e}")
        raise


def insert_apps_batch(conn: sqlite3.Connection, apps: list) -> None:
    """Insert apps in batches with progress reporting."""
    batch = []
    for a in apps:
        batch.append(a)
        if len(batch) >= BATCH:
            upsert_batch(conn, batch)
            print(f"Inserted {len(batch)} apps")
            batch = []
    if batch:
        upsert_batch(conn, batch)
        print(f"Inserted {len(batch)} apps")


def main() -> int:
    print("Fetching app list from Steam...")
    try:
        apps = fetch_applist()
        print(f"Fetched {len(apps)} apps")
    except Exception as e:
        print(f"Failed to fetch app list from Steam: {e}")
        return 1

    # Check if database exists and is corrupt
    db_exists = DB_PATH.exists()
    if db_exists:
        print(f"Database exists at {DB_PATH}")
        try:
            # Try to connect and check integrity
            test_conn = sqlite3.connect(str(DB_PATH))
            if not check_db_integrity(test_conn):
                print("Database integrity check failed - database appears corrupt")
                test_conn.close()
                if not backup_corrupt_db(DB_PATH):
                    print("Failed to backup corrupt database, continuing anyway...")
                db_exists = False
            else:
                print("Database integrity check passed")
                test_conn.close()
        except sqlite3.Error as e:
            print(f"Failed to check database integrity: {e}")
            print("Assuming database is corrupt and backing up...")
            if not backup_corrupt_db(DB_PATH):
                print("Failed to backup corrupt database, continuing anyway...")
            db_exists = False

    # Connect to database (will create if doesn't exist)
    try:
        conn = sqlite3.connect(str(DB_PATH))
        print(f"Connected to database at {DB_PATH}")
    except sqlite3.Error as e:
        print(f"Failed to connect to database: {e}")
        return 1

    try:
        # Initialize database schema
        print("Initializing database schema...")
        init_db(conn)
        
        # Insert apps
        print("Inserting apps...")
        insert_apps_batch(conn, apps)
        
        # Populate FTS table
        print("Populating FTS table...")
        try:
            populate_fts(conn)
            print("Done.")
            return 0
        except sqlite3.DatabaseError as e:
            print(f"FTS population failed (DB may be corrupted): {e}")
            conn.close()
            
            # Try to recover by recreating database
            print("Attempting to recover by recreating database...")
            if not backup_corrupt_db(DB_PATH):
                print("Failed to backup corrupt database")
                return 1
            
            # Recreate clean DB and repopulate
            try:
                conn = sqlite3.connect(str(DB_PATH))
                print("Recreating database...")
                init_db(conn)
                insert_apps_batch(conn, apps)
                print("Re-populating FTS table...")
                populate_fts(conn)
                print("Done (recreated DB).")
                return 0
            except Exception as ex:
                print(f"Failed to recreate database: {ex}")
                return 1
            finally:
                conn.close()
                
    except Exception as e:
        print(f"Unexpected error: {e}")
        return 1
    finally:
        try:
            conn.close()
        except:
            pass


if __name__ == "__main__":
    sys.exit(main())


