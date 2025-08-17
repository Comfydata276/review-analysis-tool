from typing import Dict, List

import httpx

from .config import settings


async def search_games_realtime(query: str, start: int = 0, count: int = 50) -> List[Dict]:
	"""Search Steam in real time. If numeric, treat as AppID; otherwise use store search.

	Returns a list of {app_id, name} dicts.
	"""
	q = query.strip()
	async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT_SECONDS) as client:
		if q.isdigit():
			# Query specific app details
			app_id = int(q)
			url = f"https://store.steampowered.com/api/appdetails?appids={app_id}&l=english"
			resp = await client.get(url)
			resp.raise_for_status()
			data = resp.json()
			entry = data.get(str(app_id)) or {}
			if entry.get("success") and entry.get("data"):
				name = (entry["data"].get("name") or "").strip()
				if name:
					return [{"app_id": app_id, "name": name}]
			return []
		else:
			# Store search for text queries
			# allow paging via start/count
			# The public storesearch endpoint appears to limit results per request (commonly 10),
			# so if the caller requests more, page multiple times and aggregate results.
			results: List[Dict] = []
			remaining = count
			current_start = start
			# conservative per-request chunk; keep small to avoid huge responses
			while remaining > 0:
				chunk_size = min(50, remaining)
				url = (
					f"https://store.steampowered.com/api/storesearch/?term={httpx.QueryParams({'term': q})['term']}"
					f"&l=english&cc=US&start={current_start}&count={chunk_size}"
				)
				resp = await client.get(url)
				resp.raise_for_status()
				data = resp.json() or {}
				items = data.get("items", [])
				if not items:
					break
				for item in items:
					app_id = item.get("id") or item.get("appid")
					name = (item.get("name") or "").strip()
					if app_id and name:
						results.append({"app_id": int(app_id), "name": name})
				# advance
				fetched = len(items)
				remaining -= fetched
				current_start += fetched
				# if fewer items returned than requested chunk, we've reached the end
				if fetched < chunk_size:
					break
			# Trim to exactly requested count in case of overshoot
			return results[:count]


async def get_app_list() -> List[Dict]:
	"""Fetch the full Steam app list (appid + name) from the Steam Web API.

	Returns a list of {app_id, name} dicts.
	"""
	url = f"{settings.STEAM_API_BASE_URL}/ISteamApps/GetAppList/v2/"
	async with httpx.AsyncClient(timeout=settings.REQUEST_TIMEOUT_SECONDS) as client:
		resp = await client.get(url)
		resp.raise_for_status()
		data = resp.json() or {}
		apps = data.get("applist", {}).get("apps", []) or []
		results: List[Dict] = []
		for entry in apps:
			appid = entry.get("appid") or entry.get("appID") or entry.get("app_id")
			name = (entry.get("name") or "").strip()
			if appid is not None and name:
				results.append({"app_id": int(appid), "name": name})
		return results


