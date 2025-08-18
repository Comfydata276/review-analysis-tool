import { Game, GameSearchResponse } from "../types";

const BASE_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

async function handleResponse<T>(resp: Response): Promise<T> {
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(text || `HTTP ${resp.status}`);
	}
	return (await resp.json()) as T;
}

// Realtime Steam search (fallback)
export async function searchGamesRealtime(query: string, start = 0, count = 200): Promise<GameSearchResponse> {
	const url = `${BASE_URL}/games/search?query=${encodeURIComponent(query)}&start=${start}&count=${count}`;
	const resp = await fetch(url);
	return handleResponse<GameSearchResponse>(resp);
}

// Local SQLite-backed search (preferred for desktop usage)
export async function searchGames(query: string, start = 0, count = 200): Promise<GameSearchResponse> {
	const url = `${BASE_URL}/games/search_local?query=${encodeURIComponent(query)}&start=${start}&count=${count}`;
	const resp = await fetch(url);
	return handleResponse<GameSearchResponse>(resp);
}

// Meilisearch removed; use `searchGames` which queries local SQLite search.

export async function getAppList(): Promise<Game[]> {
	const resp = await fetch(`${BASE_URL}/games/applist`);
	return handleResponse<Game[]>(resp);
}

export async function startBackfill(): Promise<any> {
    const resp = await fetch(`${BASE_URL}/games/backfill/start`, { method: "POST" });
    return handleResponse<any>(resp);
}

export async function getAppListStats(): Promise<{count: number; last_seen: string | null}> {
    const resp = await fetch(`${BASE_URL}/games/applist/stats`);
    return handleResponse<any>(resp);
}

export async function getBackfillStatus(): Promise<{state: string; total: number; processed: number; started_at?: string | null; finished_at?: string | null; error?: string | null}> {
	const resp = await fetch(`${BASE_URL}/games/backfill/status`);
	return handleResponse<any>(resp);
}

export async function getActiveGames(): Promise<Game[]> {
	const resp = await fetch(`${BASE_URL}/games/active`);
	return handleResponse<Game[]>(resp);
}

export async function addActiveGame(game: Game): Promise<void> {
	const resp = await fetch(`${BASE_URL}/games/active`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(game),
	});
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(text || `HTTP ${resp.status}`);
	}
}

export async function removeActiveGame(appId: number): Promise<void> {
	const resp = await fetch(`${BASE_URL}/games/active/${appId}`, { method: "DELETE" });
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(text || `HTTP ${resp.status}`);
	}
}



