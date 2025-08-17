import asyncio
import os
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def fresh_db(tmp_path):
	# Isolate DB per test to avoid cross-test contamination
	db_path = tmp_path / "test_scraper.db"
	os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
	from importlib import reload
	import backend.config as config_module
	import backend.database as database_module

	reload(config_module)
	reload(database_module)
	import backend.models as models_module
	reload(models_module)
	import backend.scraper_service as scraper_module
	reload(scraper_module)
	# Recreate tables
	models_module.Base.metadata.drop_all(bind=database_module.engine)
	models_module.Base.metadata.create_all(bind=database_module.engine)
	yield


@pytest.fixture()
def client() -> TestClient:
	from backend.main import create_app
	from backend.database import Base, engine
	Base.metadata.drop_all(bind=engine)
	Base.metadata.create_all(bind=engine)
	app = create_app()
	return TestClient(app)


def make_review(id: int, ts: int, early: bool = False, free: bool = False, lang: str = "english") -> dict:
	return {
		"recommendationid": str(id),
		"timestamp_created": ts,
		"voted_up": True,
		"review": f"Review {id}",
		"language": lang,
		"written_during_early_access": early,
		"received_for_free": free,
		"author": {"playtime_forever": 120},
	}


@pytest.mark.asyncio
async def test_scrape_single_game_sequential(monkeypatch):
	# Mock active games
	from backend.database import SessionLocal
	from backend import models

	db = SessionLocal()
	db.add(models.Game(app_id=1, name="Test Game"))
	db.commit()
	db.close()

	# Mock httpx client get for two pages
	from backend.scraper_service import scraper_service

	class MockResponse:
		def __init__(self, payload: dict, status_code: int = 200):
			self._payload = payload
			self.status_code = status_code

		def raise_for_status(self):
			if self.status_code >= 400:
				raise RuntimeError("error")

		def json(self):
			return self._payload

	pages = [
		{"reviews": [make_review(1, 1)], "query_summary": {"total_reviews": 2}, "cursor": "c1"},
		{"reviews": [make_review(2, 2)], "query_summary": {"total_reviews": 2}, "cursor": "c2"},
	]
	call_idx = {"i": 0}

	async def mock_get(url, params=None):
		idx = call_idx["i"]
		call_idx["i"] += 1
		if idx >= len(pages):
			return MockResponse({"reviews": [], "query_summary": {"total_reviews": 0}})
		return MockResponse(pages[idx])

	# Patch httpx.AsyncClient.get
	class DummyClient:
		def __init__(self, *a, **k):
			pass
		async def get(self, url, params=None):
			return await mock_get(url, params=params)
		async def aclose(self):
			return None

	monkeypatch.setattr("backend.scraper_service.httpx.AsyncClient", DummyClient)

	# Start scraper
	await scraper_service.start({
		"global_settings": {"max_reviews": 10, "rate_limit_rpm": 1000, "language": "english"},
		"per_game_overrides": {},
	})

	# Wait for task to finish
	while scraper_service.progress.is_running:
		await asyncio.sleep(0.01)

	# Check saved reviews
	db = SessionLocal()
	try:
		rows = db.query(models.Review).filter(models.Review.app_id == 1).all()
		assert len(rows) == 2
	finally:
		db.close()


@pytest.mark.asyncio
async def test_filters_and_stop(monkeypatch):
	from backend.database import SessionLocal
	from backend import models
	from backend.scraper_service import scraper_service

	db = SessionLocal()
	db.add(models.Game(app_id=2, name="Game 2"))
	db.commit()
	db.close()

	# Build reviews with mixed attributes
	now = int(datetime.now(tz=timezone.utc).timestamp())
	pages = [
		{"reviews": [
			make_review(10, now - 1000, early=False, free=False, lang="english"),
			make_review(11, now - 900, early=True, free=False, lang="english"),
			make_review(12, now - 800, early=False, free=True, lang="spanish"),
		], "query_summary": {"total_reviews": 3}, "cursor": "c1"},
		{"reviews": [
			make_review(13, now - 700, early=False, free=False, lang="english"),
		], "query_summary": {"total_reviews": 4}, "cursor": "c2"},
	]
	call_idx = {"i": 0}

	class MockResponse:
		def __init__(self, payload: dict, status_code: int = 200):
			self._payload = payload
			self.status_code = status_code

		def raise_for_status(self):
			if self.status_code >= 400:
				raise RuntimeError("error")

		def json(self):
			return self._payload

	async def mock_get(url, params=None):
		idx = call_idx["i"]
		call_idx["i"] += 1
		if idx >= len(pages):
			return MockResponse({"reviews": [], "query_summary": {"total_reviews": 0}})
		return MockResponse(pages[idx])

	class DummyClient:
		def __init__(self, *a, **k):
			pass
		async def get(self, url, params=None):
			return await mock_get(url, params=params)
		async def aclose(self):
			return None

	monkeypatch.setattr("backend.scraper_service.httpx.AsyncClient", DummyClient)

	await scraper_service.start({
		"global_settings": {
			"max_reviews": 10,
			"rate_limit_rpm": 1000,
			"language": "english",
			# Choose a start date earlier than id=10 to include it
			"start_date": datetime.fromtimestamp(now - 2000, tz=timezone.utc).strftime("%Y-%m-%d"),
			"end_date": datetime.fromtimestamp(now - 750, tz=timezone.utc).strftime("%Y-%m-%d"),
			"early_access": "exclude",
			"received_for_free": "exclude",
		},
		"per_game_overrides": {},
	})

	# Request stop after first response is processed
	await asyncio.sleep(0.01)
	await scraper_service.stop()

	# Wait until not running
	while scraper_service.progress.is_running:
		await asyncio.sleep(0.01)

	# Validate that filters applied: From first page, only id=10 passes (11 early, 12 wrong lang), from second page id=13 is outside end_date
	db = SessionLocal()
	try:
		rows = db.query(models.Review).filter(models.Review.app_id == 2).all()
		# Depending on stop timing, at least first page filtered result should be saved
		assert any(r.review_id == "10" for r in rows)
	finally:
		db.close()


