import os
from typing import Generator

import pytest
from fastapi.testclient import TestClient


@pytest.fixture(autouse=True)
def set_temp_db_env(tmp_path) -> Generator[None, None, None]:
	# Point DATABASE_URL to a temp SQLite db before app import
	db_path = tmp_path / "test.db"
	os.environ["DATABASE_URL"] = f"sqlite:///{db_path}"
	yield
	# Nothing to cleanup; file is in tmp_path


@pytest.fixture()
def client(set_temp_db_env) -> TestClient:
	from backend.main import create_app
	from backend.database import Base, engine
	# Ensure fresh tables per test
	Base.metadata.drop_all(bind=engine)
	Base.metadata.create_all(bind=engine)
	app = create_app()
	return TestClient(app)


def test_add_game(client: TestClient):
	resp = client.post("/games/active", json={"app_id": 570, "name": "Dota 2"})
	assert resp.status_code == 201
	data = resp.json()
	assert data["app_id"] == 570
	assert data["name"] == "Dota 2"

	# List active
	resp2 = client.get("/games/active")
	assert resp2.status_code == 200
	items = resp2.json()
	assert any(it["app_id"] == 570 for it in items)


def test_remove_game(client: TestClient):
	client.post("/games/active", json={"app_id": 10, "name": "Counter-Strike"})
	resp = client.delete("/games/active/10")
	assert resp.status_code == 204
	resp2 = client.get("/games/active")
	assert all(it["app_id"] != 10 for it in resp2.json())


def test_search_by_name_realtime(client: TestClient, monkeypatch):
	# Mock realtime search to return items matching query
	from backend import steam_api

	async def mock_realtime(query: str):
		q = query.lower()
		catalog = [
			{"app_id": 123, "name": "Stardew Valley"},
			{"app_id": 456, "name": "Starbound"},
		]
		return [g for g in catalog if q in g["name"].lower()]

	monkeypatch.setattr(steam_api, "search_games_realtime", mock_realtime)

	resp = client.get("/games/search", params={"query": "stardew"})
	assert resp.status_code == 200
	results = resp.json()
	assert any(r["app_id"] == 123 for r in results)

	# Ensure DB not modified by search
	resp_active = client.get("/games/active")
	assert all(r["app_id"] != 123 for r in resp_active.json())


def test_search_by_appid_realtime(client: TestClient, monkeypatch):
	from backend import steam_api

	async def mock_realtime(query: str):
		if query == "570":
			return [{"app_id": 570, "name": "Dota 2"}]
		return []

	monkeypatch.setattr(steam_api, "search_games_realtime", mock_realtime)

	resp = client.get("/games/search", params={"query": "570"})
	assert resp.status_code == 200
	results = resp.json()
	assert any(r["app_id"] == 570 for r in results)

	# Ensure search didn't persist
	resp_active = client.get("/games/active")
	assert all(r["app_id"] != 570 for r in resp_active.json())


