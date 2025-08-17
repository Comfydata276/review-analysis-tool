# Packaging for Windows (single-exe) — Review Analysis Tool

This document outlines how to produce a single Windows executable that bundles the backend (FastAPI) and frontend for local desktop usage. The recommended approach is to keep the backend as the single entrypoint; the frontend can be built to static files and served by the backend or the app can open the local URL in the user's default browser.

Prerequisites
- Python 3.10+ installed
- Node.js (for building frontend)
- PyInstaller (install into the Python environment used to run the backend):
  - `pip install pyinstaller`

High-level steps
1. Build the frontend (optional static serving)
   - cd frontend
   - `npm install` (if dependencies changed)
   - `npm run build` (produces `dist/`)

2. Ensure backend first-run behavior is acceptable (it will create/populate `app.db` on first run using Steam's GetAppList).

3. Create a small entry script that starts the backend (we use `backend/main.py` as the FastAPI app).

4. Use PyInstaller to bundle the backend and its dependencies into a single exe. Example:

```bash
pyinstaller --onefile --add-data "frontend/dist;frontend/dist" --hidden-import=jinja2 backend/main.py
```

Notes on `--add-data`:
- The `--add-data "src;dest"` syntax copies files into the exe bundle. On Windows use `;` as the separator. We include `frontend/dist` so the bundled backend can serve static files.

Serving the frontend:
- If you included `frontend/dist` in the bundle, `backend/main.py` will serve it from `/` (StaticFiles). Otherwise, the app will still work and you can run the frontend separately during development.

Where the DB lives
- The app uses `DATABASE_URL` environment variable; default is `sqlite:///./app.db` which will create `app.db` next to the exe when run. For per-user storage, set `DATABASE_URL` to e.g. `sqlite:///C:/Users/<user>/AppData/Local/ReviewAnalysis/app.db` in your installer shortcuts.

Auto-backfill considerations
- The startup code runs the backfill when the DB file is missing or empty. This can take some time and perform network IO. For a nicer UX, consider:
  - Running the backfill asynchronously in a background thread and display progress in the UI.
  - Or run a minimal quick seed on first-run and fetch the rest in the background.

Packaging caveats
- Tests and native dependencies (e.g., `httpx`, `sqlite3`) must be included — PyInstaller typically detects them, but test a sandboxed install.
- Antivirus false positives can occur for single-file exes; sign the binary for distribution to reduce warnings.

Further automation
- You can write a simple Powershell or NSIS script to produce an installer that places the exe, sets up shortcuts, and configures `DATABASE_URL` for the user. I can scaffold that if you want.


