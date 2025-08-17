from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import games, scraper, reviews


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

	# Routers
	app.include_router(games.router)
	app.include_router(scraper.router)
	app.include_router(reviews.router)

	return app


app = create_app()


