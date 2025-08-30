import { Game, GameSearchResponse } from "../types";

const BASE_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

// Utility function to handle API errors properly
async function handleApiError(response: Response): Promise<never> {
  let errorMessage = "An unknown error occurred";

  try {
    const errorData = await response.json();
    // Extract the detail message from FastAPI error responses
    if (errorData.detail) {
      errorMessage = errorData.detail;
    } else if (typeof errorData === 'string') {
      errorMessage = errorData;
    } else {
      errorMessage = JSON.stringify(errorData);
    }
  } catch {
    // If JSON parsing fails, fall back to text
    try {
      const text = await response.text();
      if (text) {
        errorMessage = text;
      }
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
  }

  throw new Error(errorMessage);
}

async function handleResponse<T>(resp: Response): Promise<T> {
	if (!resp.ok) {
		await handleApiError(resp);
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

// Search local apps but only return games that have reviews in the DB
export async function searchGamesWithReviews(query: string, start = 0, count = 200): Promise<GameSearchResponse> {
    const url = `${BASE_URL}/games/search_local_reviews?query=${encodeURIComponent(query)}&start=${start}&count=${count}`;
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
		await handleApiError(resp);
	}
}

export async function removeActiveGame(appId: number): Promise<void> {
	const resp = await fetch(`${BASE_URL}/games/active/${appId}`, { method: "DELETE" });
	if (!resp.ok) {
		await handleApiError(resp);
	}
}



