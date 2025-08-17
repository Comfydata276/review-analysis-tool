from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import games, scraper, reviews
from fastapi.staticfiles import StaticFiles
from pathlib import Path


def create_app() -> FastAPI:
	app = FastAPI(title="Review Analysis Backend", version="0.1.0")

	# CORS for Electron/React frontend on localhost
	app.add_middleware(
		CORSMiddleware,
		allow_origins=["http://localhost", "http://localhost:3000", "http://127.0.0.1:3000"],
		allow_credentials=True,
		allow_methods=["*"],
		allow_headers=["*"],
	)

	# Create DB tables using current engine (import lazily to pick up env changes)
	from .database import Base, engine
	Base.metadata.create_all(bind=engine)

	# First-run: if using SQLite and DB file missing or empty, run initial backfill to populate applist
	from pathlib import Path
	from .config import settings
	if settings.DATABASE_URL.startswith("sqlite"):
		# path like sqlite:///./app.db or sqlite:///C:/path/app.db
		db_path = settings.DATABASE_URL.replace("sqlite:///", "")
		p = Path(db_path)
		# If DB missing/empty, start background backfill and continue serving
		if not p.exists() or p.stat().st_size == 0:
			try:
				from .backfill_service import get_default_service
				service = get_default_service()
				service.start_background()
				print("First-run: started background backfill of local Steam applist")
			except Exception as e:
				print(f"Failed to start background backfill: {e}")

	# Routers
	app.include_router(games.router)
	app.include_router(scraper.router)
	app.include_router(reviews.router)

	# Optionally serve built frontend static files (if present). Frontend build
	# should be placed at ../frontend/dist relative to the backend package, or the
	# location can be overridden with the FRONTEND_DIST env var / settings.
	frontend_dir = Path(__file__).resolve().parent.parent / "frontend" / "dist"
	if frontend_dir.exists():
		app.mount("/", StaticFiles(directory=str(frontend_dir), html=True), name="frontend")

	return app


app = create_app()


