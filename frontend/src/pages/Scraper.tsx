import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { getActiveGames } from "../api/games";
import {
	startScraper,
	stopScraper,
	getScraperStatus,
	ScraperSettings,
	ScraperStatus,
} from "../api/scraper";
import { Game } from "../types";
import { Card } from "../components/ui/Card";
import { RadialProgress } from "../components/ui/RadialProgress";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import toast from "react-hot-toast";
import { PlayIcon, StopIcon } from "@heroicons/react/24/outline";
import {
	Area,
	AreaChart,
	ResponsiveContainer,
	XAxis,
	YAxis,
	Tooltip,
} from "recharts";

function formatETA(sec: number): string {
	if (!sec || sec <= 0) return "--";
	const m = Math.floor(sec / 60);
	const s = sec % 60;
	return `${m}m ${s}s`;
}

type Point = {
	t: number;
	scraped: number;
	rpm: number;
};

export const Scraper: React.FC = () => {
	const [activeGames, setActiveGames] = useState<Game[]>([]);
	const [status, setStatus] = useState<ScraperStatus | null>(null);
	const [isLoadingStatus, setIsLoadingStatus] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [running, setRunning] = useState(false);
	const [history, setHistory] = useState<Point[]>([]);

	const [globalSettings, setGlobalSettings] =
		useState<ScraperSettings["global_settings"]>({
			max_reviews: 1000,
			rate_limit_rpm: 60,
			language: "english",
			start_date: undefined,
			end_date: undefined,
			early_access: "include",
			received_for_free: "include",
		});

	const [perGameOverrides, setPerGameOverrides] = useState<
		Record<number, Partial<ScraperSettings["global_settings"]> & { enabled?: boolean }>
	>({});

	// Load active games on mount
	useEffect(() => {
		getActiveGames()
			.then(setActiveGames)
			.catch((e) => {
				const msg = e.message || "Failed to load active games";
				setError(msg);
				toast.error(msg);
			});
	}, []);

	// Poll status
	useEffect(() => {
		let timer: any;
		async function poll() {
			try {
				setIsLoadingStatus(true);
				const s = await getScraperStatus();
				setStatus(s);
				setRunning(s.is_running);
				// live stats history (global scraped -> rpm)
				const now = Date.now();
				const scraped = s.global_progress?.scraped || 0;
				setHistory((prev) => {
					const prevPoint = prev[prev.length - 1];
					let rpm = 0;
					if (prevPoint) {
						const dt = (now - prevPoint.t) / 1000;
						const ds = scraped - prevPoint.scraped;
						rpm = dt > 0 ? (ds / dt) * 60 : 0;
					}
					const next = [...prev, { t: now, scraped, rpm }];
					// keep last ~120 points (~4 minutes @2s polling)
					return next.slice(-120);
				});
			} catch (e: any) {
				const msg = e.message || "Status error";
				setError(msg);
				toast.error(msg, { id: "status-error" });
			} finally {
				setIsLoadingStatus(false);
			}
		}

		// poll once immediately
		poll();
		timer = setInterval(poll, running ? 2000 : 5000);

		return () => {
			if (timer) clearInterval(timer);
		};
	}, [running]);

	const logsEndRef = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [status?.logs?.length]);

	const handleStart = useCallback(async () => {
		try {
			setError(null);
			const payload: ScraperSettings = {
				global_settings: globalSettings,
				per_game_overrides: Object.fromEntries(
					Object.entries(perGameOverrides)
						.filter(([_, v]) => (v as any)?.enabled)
						.map(([k, v]) => [Number(k), { ...v, enabled: undefined }])
				),
			};
			await startScraper(payload);
			setRunning(true);
			toast.success("Scraper started");
		} catch (e: any) {
			const msg = e.message || "Failed to start scraper";
			setError(msg);
			toast.error(msg);
		}
	}, [globalSettings, perGameOverrides]);

	const handleStop = useCallback(async () => {
		try {
			await stopScraper();
			toast.success("Scraper stopping...");
		} catch (e: any) {
			const msg = e.message || "Failed to stop scraper";
			setError(msg);
			toast.error(msg);
		}
	}, []);

	const globalPct = useMemo(() => {
		const g = status?.global_progress;
		if (!g || !g.total) return 0;
		return Math.min(100, Math.floor((g.scraped / g.total) * 100));
	}, [status]);

	const currentPct = useMemo(() => {
		const c = status?.current_game_progress;
		if (!c || !c.total) return 0;
		return Math.min(100, Math.floor((c.scraped / c.total) * 100));
	}, [status]);

	const rpmNow = Math.max(0, Math.round(history[history.length - 1]?.rpm || 0));
	const totalScraped = status?.global_progress?.scraped || 0;
	const rateLimit = globalSettings.rate_limit_rpm;

	return (
		<div className="space-y-6 p-0" data-testid="scraper-page">

			<div className="flex items-center justify-between px-1">
				<div>
					<h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-indigo-600">Steam Review Scraper</h1>
					<p className="text-sm text-muted">Monitor progress, tweak settings, and view logs.</p>
				</div>
				<div className="flex items-center gap-2">
					<Button onClick={handleStart} disabled={running} variant="gradient" className="inline-flex items-center gap-2" data-testid="start-scraper">
						<PlayIcon className="h-4 w-4" />
						Start
					</Button>
					<Button onClick={handleStop} disabled={!running} variant="destructive" className="inline-flex items-center gap-2" data-testid="stop-scraper">
						<StopIcon className="h-4 w-4" />
						Stop
					</Button>
				</div>
			</div>

			{/* Stats */}
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
				<Card title="Global Progress">
					<div className="flex items-center justify-center">
						<RadialProgress value={globalPct} label="Global" className="text-blue-600" />
					</div>
					<div className="mt-3 text-center text-sm text-gray-600 dark:text-gray-400">ETA {formatETA(status?.global_progress?.eta_seconds || 0)}</div>
				</Card>

				<Card title="Current Game">
					<div className="flex items-center justify-center">
						<RadialProgress value={currentPct} label="Current" className="text-green-600" />
					</div>
					<div className="mt-2 truncate text-center text-xs text-gray-600 dark:text-gray-400">{status?.current_game ? `${status.current_game.name} (${status.current_game.app_id})` : "Idle"}</div>
					<div className="mt-1 text-center text-sm text-gray-600 dark:text-gray-400">ETA {formatETA(status?.current_game_progress?.eta_seconds || 0)}</div>
				</Card>

				<Card title="Throughput (RPM)">
					<div className="h-24 pt-2">
						<ResponsiveContainer width="100%" height="100%">
							<AreaChart data={history}>
								<defs>
									<linearGradient id="rpm" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="#2563eb" stopOpacity={0.8} />
										<stop offset="95%" stopColor="#2563eb" stopOpacity={0.1} />
									</linearGradient>
								</defs>
								<XAxis dataKey="t" tickFormatter={() => ""} axisLine={false} tickLine={false} />
								<YAxis width={30} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
								<Tooltip formatter={(v: any) => `${Math.round(v)} rpm`} labelFormatter={() => ""} />
								<Area type="monotone" dataKey="rpm" stroke="#2563eb" fillOpacity={1} fill="url(#rpm)" isAnimationActive={false} />
							</AreaChart>
						</ResponsiveContainer>
					</div>
					<div className="mt-2 text-center text-2xl font-semibold">{rpmNow}</div>
				</Card>

				<Card title="Totals">
					<div className="space-y-2">
						<div className="flex items-center justify-between text-sm">
							<span className="text-gray-600 dark:text-gray-400">Reviews scraped</span>
							<span className="font-medium">{totalScraped}</span>
						</div>
						<div className="flex items-center justify-between text-sm">
							<span className="text-gray-600 dark:text-gray-400">Rate limit (rpm)</span>
							<span className="font-medium">{rateLimit}</span>
						</div>
						<div className="flex items-center justify-between text-sm">
							<span className="text-gray-600 dark:text-gray-400">Active games</span>
							<span className="font-medium">{activeGames.length}</span>
						</div>
					</div>
				</Card>
			</div>

			{/* Logs */}
			<Card title="Logs">
				<div className="max-h-56 overflow-y-auto rounded border border-border bg-card p-2 text-xs" data-testid="logs">
					{(status?.logs || []).map((line, idx) => (
						<div key={idx} className="whitespace-pre-wrap leading-5">{line}</div>
					))}
					<div ref={logsEndRef} />
				</div>
			</Card>

			{/* Settings */}
			<Card title="Global Settings" subtitle="Adjust defaults and overrides">
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<label className="text-sm">
						Max reviews per game
						<Input
							type="number"
							className="mt-1"
							value={globalSettings.max_reviews}
							onChange={(e) =>
								setGlobalSettings((s) => ({
									...s,
									max_reviews: Number(e.target.value),
								}))
							}
							disabled={running}
							data-testid="max-reviews"
						/>
					</label>
					<label className="text-sm">
						Rate limit (RPM)
						<Input
							type="number"
							className="mt-1"
							value={globalSettings.rate_limit_rpm}
							onChange={(e) =>
								setGlobalSettings((s) => ({
									...s,
									rate_limit_rpm: Number(e.target.value),
								}))
							}
							disabled={running}
							data-testid="rate-limit"
						/>
					</label>
					<label className="text-sm">
						Language
						<Select
							options={[{ label: "english", value: "english" }, { label: "spanish", value: "spanish" }, { label: "german", value: "german" }]}
							className="mt-1"
							value={globalSettings.language}
							onChange={(e) => setGlobalSettings((s) => ({ ...s, language: e.target.value }))}
							disabled={running}
							data-testid="language"
						/>
					</label>
					<label className="text-sm">
						Start date
						<Input
							type="date"
							className="mt-1"
							value={globalSettings.start_date || ""}
							onChange={(e) => setGlobalSettings((s) => ({ ...s, start_date: e.target.value || undefined }))}
							disabled={running}
							data-testid="start-date"
						/>
					</label>
					<label className="text-sm">
						End date
						<Input
							type="date"
							className="mt-1"
							value={globalSettings.end_date || ""}
							onChange={(e) => setGlobalSettings((s) => ({ ...s, end_date: e.target.value || undefined }))}
							disabled={running}
							data-testid="end-date"
						/>
					</label>
					<label className="text-sm">
						Early access
						<Select
							options={[{ label: "include", value: "include" }, { label: "exclude", value: "exclude" }, { label: "only", value: "only" }]}
							className="mt-1"
							value={globalSettings.early_access}
							onChange={(e) => setGlobalSettings((s) => ({ ...s, early_access: e.target.value as any }))}
							disabled={running}
							data-testid="early-access"
						/>
					</label>
					<label className="text-sm">
						Received for free
						<Select
							options={[{ label: "include", value: "include" }, { label: "exclude", value: "exclude" }, { label: "only", value: "only" }]}
							className="mt-1"
							value={globalSettings.received_for_free}
							onChange={(e) => setGlobalSettings((s) => ({ ...s, received_for_free: e.target.value as any }))}
							disabled={running}
							data-testid="received-for-free"
						/>
					</label>
				</div>

				{/* Per-game overrides */}
				<div className="mt-4 space-y-2">
					<h3 className="font-medium">Per-game overrides</h3>
					{activeGames.map((g) => {
						const override = perGameOverrides[g.app_id] || {};
						const enabled = !!override.enabled;
						return (
							<div key={g.app_id} className="rounded border border-border bg-card">
								<div className="flex items-center justify-between px-3 py-2">
									<div className="text-sm font-medium">{g.name} ({g.app_id})</div>
									<label className="inline-flex items-center gap-2 text-sm">
										<input type="checkbox" checked={enabled} onChange={(e) => setPerGameOverrides((s) => ({ ...s, [g.app_id]: { ...override, enabled: e.target.checked } }))} disabled={running} />
										<span>Enable override</span>
									</label>
								</div>
								{enabled && (
									<div className="grid grid-cols-1 gap-3 px-3 pb-3 sm:grid-cols-2">
										<label className="text-sm">
											Max reviews
											<Input type="number" className="mt-1" value={override.max_reviews ?? globalSettings.max_reviews} onChange={(e) => setPerGameOverrides((s) => ({ ...s, [g.app_id]: { ...override, max_reviews: Number(e.target.value), enabled } }))} disabled={running} />
										</label>
										<label className="text-sm">
											Rate limit (RPM)
											<Input type="number" className="mt-1" value={override.rate_limit_rpm ?? globalSettings.rate_limit_rpm} onChange={(e) => setPerGameOverrides((s) => ({ ...s, [g.app_id]: { ...override, rate_limit_rpm: Number(e.target.value), enabled } }))} disabled={running} />
										</label>
										<label className="text-sm">
											Language
											<Select options={[{ label: "english", value: "english" }, { label: "spanish", value: "spanish" }, { label: "german", value: "german" }]} className="mt-1" value={override.language ?? globalSettings.language} onChange={(e) => setPerGameOverrides((s) => ({ ...s, [g.app_id]: { ...override, language: e.target.value, enabled } }))} disabled={running} />
										</label>
										<label className="text-sm">
											Start date
											<Input type="date" className="mt-1" value={override.start_date ?? ""} onChange={(e) => setPerGameOverrides((s) => ({ ...s, [g.app_id]: { ...override, start_date: e.target.value || undefined, enabled } }))} disabled={running} />
										</label>
										<label className="text-sm">
											End date
											<Input type="date" className="mt-1" value={override.end_date ?? ""} onChange={(e) => setPerGameOverrides((s) => ({ ...s, [g.app_id]: { ...override, end_date: e.target.value || undefined, enabled } }))} disabled={running} />
										</label>
										<label className="text-sm">
											Early access
											<Select options={[{ label: "include", value: "include" }, { label: "exclude", value: "exclude" }, { label: "only", value: "only" }]} className="mt-1" value={override.early_access ?? globalSettings.early_access} onChange={(e) => setPerGameOverrides((s) => ({ ...s, [g.app_id]: { ...override, early_access: e.target.value as any, enabled } }))} disabled={running} />
										</label>
										<label className="text-sm">
											Received for free
											<Select options={[{ label: "include", value: "include" }, { label: "exclude", value: "exclude" }, { label: "only", value: "only" }]} className="mt-1" value={override.received_for_free ?? globalSettings.received_for_free} onChange={(e) => setPerGameOverrides((s) => ({ ...s, [g.app_id]: { ...override, received_for_free: e.target.value as any, enabled } }))} disabled={running} />
										</label>
									</div>
								)}
							</div>
						);
					})}
				</div>
			</Card>
		</div>
	);
};