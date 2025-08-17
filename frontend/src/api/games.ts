import { Game, GameSearchResponse } from "../types";

const BASE_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

async function handleResponse<T>(resp: Response): Promise<T> {
	if (!resp.ok) {
		const text = await resp.text();
		throw new Error(text || `HTTP ${resp.status}`);
	}
	return (await resp.json()) as T;
}

export async function searchGames(query: string, start = 0, count = 200): Promise<GameSearchResponse> {
	const url = `${BASE_URL}/games/search?query=${encodeURIComponent(query)}&start=${start}&count=${count}`;
	const resp = await fetch(url);
	return handleResponse<GameSearchResponse>(resp);
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


