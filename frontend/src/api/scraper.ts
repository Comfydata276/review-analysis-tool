export interface ScraperSettings {
	global_settings: {
		max_reviews?: number;
		complete_scraping?: boolean;
		rate_limit_rpm: number;
		language: string;
		start_date?: string;
		end_date?: string;
		early_access: "include" | "exclude" | "only";
		received_for_free: "include" | "exclude" | "only";
		min_playtime?: number;
		max_playtime?: number;
	};
	per_game_overrides: {
		[app_id: number]: Partial<ScraperSettings["global_settings"]>;
	};
}

export interface ScraperStatus {
	is_running: boolean;
	current_game: { app_id: number; name: string } | null;
	current_game_progress: { scraped: number; total: number; eta_seconds: number };
	global_progress: { scraped: number; total: number; eta_seconds: number };
	logs: string[];
}

const BASE_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

async function handle<T>(resp: Response): Promise<T> {
	if (!resp.ok) {
		throw new Error(await resp.text());
	}
	return (await resp.json()) as T;
}

export async function startScraper(payload: ScraperSettings): Promise<void> {
	const resp = await fetch(`${BASE_URL}/scraper/start`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!resp.ok) throw new Error(await resp.text());
}

export async function stopScraper(): Promise<void> {
	const resp = await fetch(`${BASE_URL}/scraper/stop`, { method: "POST" });
	if (!resp.ok) throw new Error(await resp.text());
}

export async function getScraperStatus(): Promise<ScraperStatus> {
	const resp = await fetch(`${BASE_URL}/scraper/status`);
	return handle<ScraperStatus>(resp);
}


