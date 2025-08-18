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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/Tabs";
import { FormField, FormSection, FormGrid } from "../components/ui/FormField";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../components/ui/Collapsible";
import { cn } from "../lib/utils";
import toast from "react-hot-toast";
import { desktopUtils } from "../utils/notifications";
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
	const [settingsTab, setSettingsTab] = useState("global");
	const [configurationOpen, setConfigurationOpen] = useState(true);
	const [exportOpen, setExportOpen] = useState(false);
	const [selectedExportGame, setSelectedExportGame] = useState<number | null>(null);

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
			.then((games) => {
				setActiveGames(games);
				// Auto-select first game for export if none selected
				if (games.length > 0 && !selectedExportGame) {
					setSelectedExportGame(games[0].app_id);
				}
			})
			.catch((e) => {
				const msg = e.message || "Failed to load active games";
				setError(msg);
				toast.error(msg);
			});
	}, [selectedExportGame]);

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
	// Removed auto-scroll to logs - user doesn't want this behavior
	// useEffect(() => {
	// 	logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
	// }, [status?.logs?.length]);

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

	const handleExport = useCallback(async (format: "csv" | "xlsx") => {
		if (!selectedExportGame) {
			toast.error("Please select a game to export reviews for.");
			return;
		}

		try {
			const selectedGame = activeGames.find(g => g.app_id === selectedExportGame);
			const gameName = selectedGame?.name || `Game_${selectedExportGame}`;
			
			// Use the correct backend URL like in GameList component
			const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
			const url = `${BACKEND_URL}/reviews/export/${selectedExportGame}?format=${format}`;
			const response = await fetch(url);
			
			if (!response.ok) {
				const text = await response.text();
				if (response.status === 404) {
					toast.error("No reviews found for the selected game.");
					return;
				}
				throw new Error(text || `HTTP ${response.status}`);
			}

			// Get the filename from the response headers or create one
			const disposition = response.headers.get("Content-Disposition") || "";
			let filename = `reviews_${selectedExportGame}.${format}`;
			const m = /filename="?([^";]+)"?/.exec(disposition);
			if (m && m[1]) filename = m[1];

			const blob = await response.blob();
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = blobUrl;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(blobUrl);
			
			toast.success(`Download started for ${gameName}`);
		} catch (error: any) {
			console.error("Export failed:", error);
			toast.error(error.message || "Download failed");
		}
	}, [selectedExportGame, activeGames]);

	return (
		<div className="space-y-6 p-0" data-testid="scraper-page">

			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-indigo-600">Steam Review Scraper</h1>
					<p className="text-sm text-muted-foreground">Monitor progress, configure settings, and view real-time logs.</p>
				</div>
				<div className="flex items-center gap-3">
					{/* Status Indicator */}
				<div className="flex items-center gap-2">
						<div className={cn(
							"h-2 w-2 rounded-full",
							running ? "bg-green-500 animate-pulse" : "bg-gray-400"
						)} />
						<span className="text-sm text-muted-foreground">
							{running ? "Running" : "Idle"}
						</span>
					</div>
					
					{/* Control Buttons */}
					<Button 
						onClick={handleStart} 
						disabled={running || activeGames.length === 0} 
						variant="gradient" 
						className="inline-flex items-center gap-2" 
						data-testid="start-scraper"
					>
						<PlayIcon className="h-4 w-4" />
						Start Scraping
					</Button>
					<Button 
						onClick={handleStop} 
						disabled={!running} 
						variant="destructive" 
						className="inline-flex items-center gap-2" 
						data-testid="stop-scraper"
					>
						<StopIcon className="h-4 w-4" />
						Stop
					</Button>
				</div>
			</div>
			
			{/* Quick Action Bar */}
			{!running && activeGames.length === 0 && (
				<div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
					<div className="flex items-center gap-3">
						<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900">
							<svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
							</svg>
						</div>
						<div className="flex-1">
							<h3 className="font-medium text-blue-900 dark:text-blue-100">Ready to Start</h3>
							<p className="text-sm text-blue-700 dark:text-blue-300">Add games from the Game Selector tab to begin scraping reviews.</p>
						</div>
						<Button variant="outline" size="sm" onClick={() => window.location.href = '/selector'}>
							Go to Game Selector
						</Button>
					</div>
				</div>
			)}

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
			<Collapsible open={configurationOpen} onOpenChange={setConfigurationOpen}>
				<Card>
					<CollapsibleTrigger asChild>
						<div className="flex items-center justify-between border-b border-border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
							<div>
								<h3 className="text-lg font-semibold">Configuration</h3>
								<p className="text-sm text-muted-foreground">Configure scraper settings and per-game overrides</p>
							</div>
						</div>
					</CollapsibleTrigger>
					<CollapsibleContent>
						<div className="p-4">
							<Tabs value={settingsTab} onValueChange={setSettingsTab}>
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="global">Global Settings</TabsTrigger>
						<TabsTrigger value="overrides">Game Overrides</TabsTrigger>
					</TabsList>

					<TabsContent value="global" className="space-y-6">
						<FormSection 
							title="Basic Settings" 
							description="Configure the main scraping parameters"
						>
							<FormGrid cols={2}>
								<FormField 
									label="Max Reviews per Game" 
									description="Maximum number of reviews to scrape per game"
									required
								>
						<Input
							type="number"
										min="1"
										max="10000"
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
								</FormField>

								<FormField 
									label="Rate Limit (RPM)" 
									description="Requests per minute to avoid rate limiting"
									required
								>
						<Input
							type="number"
										min="1"
										max="300"
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
								</FormField>
							</FormGrid>
						</FormSection>

						<FormSection 
							title="Language & Filtering" 
							description="Configure language and content filters"
						>
							<FormGrid cols={3}>
								<FormField label="Language" description="Review language preference">
						<Select
										options={[
											{ label: "English", value: "english" }, 
											{ label: "Spanish", value: "spanish" }, 
											{ label: "German", value: "german" },
											{ label: "French", value: "french" },
											{ label: "Italian", value: "italian" },
											{ label: "Japanese", value: "japanese" }
										]}
							value={globalSettings.language}
							onChange={(e) => setGlobalSettings((s) => ({ ...s, language: e.target.value }))}
							disabled={running}
							data-testid="language"
						/>
								</FormField>

								<FormField label="Early Access" description="Include early access games">
									<Select
										options={[
											{ label: "Include", value: "include" }, 
											{ label: "Exclude", value: "exclude" }, 
											{ label: "Only", value: "only" }
										]}
										value={globalSettings.early_access}
										onChange={(e) => setGlobalSettings((s) => ({ ...s, early_access: e.target.value as any }))}
										disabled={running}
										data-testid="early-access"
									/>
								</FormField>

								<FormField label="Free Games" description="Include games received for free">
									<Select
										options={[
											{ label: "Include", value: "include" }, 
											{ label: "Exclude", value: "exclude" }, 
											{ label: "Only", value: "only" }
										]}
										value={globalSettings.received_for_free}
										onChange={(e) => setGlobalSettings((s) => ({ ...s, received_for_free: e.target.value as any }))}
										disabled={running}
										data-testid="received-for-free"
									/>
								</FormField>
							</FormGrid>
						</FormSection>

						<FormSection 
							title="Date Range" 
							description="Limit reviews to a specific time period (optional)"
						>
							<FormGrid cols={2}>
								<FormField 
									label="Start Date" 
									description="Only include reviews after this date"
								>
						<Input
							type="date"
							value={globalSettings.start_date || ""}
							onChange={(e) => setGlobalSettings((s) => ({ ...s, start_date: e.target.value || undefined }))}
							disabled={running}
							data-testid="start-date"
						/>
								</FormField>

								<FormField 
									label="End Date" 
									description="Only include reviews before this date"
								>
						<Input
							type="date"
							value={globalSettings.end_date || ""}
							onChange={(e) => setGlobalSettings((s) => ({ ...s, end_date: e.target.value || undefined }))}
							disabled={running}
							data-testid="end-date"
						/>
								</FormField>
							</FormGrid>
						</FormSection>
					</TabsContent>

					<TabsContent value="overrides" className="space-y-4">
						<div className="text-sm text-muted-foreground">
							Override global settings for specific games. Useful for games that need different parameters.
						</div>
						
						{activeGames.length === 0 ? (
							<div className="text-center py-8 text-muted-foreground">
								<div className="mb-2">No active games selected</div>
								<div className="text-sm">Add games from the Game Selector to configure overrides</div>
							</div>
						) : (
							<div className="space-y-3">
								{activeGames.map((game) => {
									const override = perGameOverrides[game.app_id] || {};
									const enabled = !!override.enabled;
									
									return (
										<Card key={game.app_id} className="transition-all duration-200">
											<div className="flex items-center justify-between p-4 border-b border-border">
												<div className="flex items-center gap-3">
													<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 text-white text-sm font-bold">
														{game.name.charAt(0).toUpperCase()}
													</div>
													<div>
														<h4 className="font-medium">{game.name}</h4>
														<p className="text-sm text-muted-foreground">App ID: {game.app_id}</p>
													</div>
												</div>
												<label className="inline-flex items-center gap-2 cursor-pointer">
													<input 
														type="checkbox" 
														checked={enabled} 
														onChange={(e) => setPerGameOverrides((s) => ({ 
															...s, 
															[game.app_id]: { ...override, enabled: e.target.checked } 
														}))} 
							disabled={running}
														className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
													/>
													<span className="text-sm font-medium">Enable Overrides</span>
					</label>
				</div>

								{enabled && (
												<div className="p-4 space-y-4 bg-muted/50">
													<FormGrid cols={2}>
														<FormField label="Max Reviews">
															<Input 
																type="number" 
																min="1"
																max="10000"
																value={override.max_reviews ?? globalSettings.max_reviews} 
																onChange={(e) => setPerGameOverrides((s) => ({ 
																	...s, 
																	[game.app_id]: { ...override, max_reviews: Number(e.target.value), enabled } 
																}))} 
																disabled={running} 
															/>
														</FormField>
														
														<FormField label="Rate Limit (RPM)">
															<Input 
																type="number" 
																min="1"
																max="300"
																value={override.rate_limit_rpm ?? globalSettings.rate_limit_rpm} 
																onChange={(e) => setPerGameOverrides((s) => ({ 
																	...s, 
																	[game.app_id]: { ...override, rate_limit_rpm: Number(e.target.value), enabled } 
																}))} 
																disabled={running} 
															/>
														</FormField>
														
														<FormField label="Language">
															<Select 
																options={[
																	{ label: "English", value: "english" }, 
																	{ label: "Spanish", value: "spanish" }, 
																	{ label: "German", value: "german" },
																	{ label: "French", value: "french" },
																	{ label: "Italian", value: "italian" },
																	{ label: "Japanese", value: "japanese" }
																]} 
																value={override.language ?? globalSettings.language} 
																onChange={(e) => setPerGameOverrides((s) => ({ 
																	...s, 
																	[game.app_id]: { ...override, language: e.target.value, enabled } 
																}))} 
																disabled={running} 
															/>
														</FormField>
														
														<FormField label="Early Access">
															<Select 
																options={[
																	{ label: "Include", value: "include" }, 
																	{ label: "Exclude", value: "exclude" }, 
																	{ label: "Only", value: "only" }
																]} 
																value={override.early_access ?? globalSettings.early_access} 
																onChange={(e) => setPerGameOverrides((s) => ({ 
																	...s, 
																	[game.app_id]: { ...override, early_access: e.target.value as any, enabled } 
																}))} 
																disabled={running} 
															/>
														</FormField>
														
														<FormField label="Start Date">
															<Input 
																type="date" 
																value={override.start_date ?? ""} 
																onChange={(e) => setPerGameOverrides((s) => ({ 
																	...s, 
																	[game.app_id]: { ...override, start_date: e.target.value || undefined, enabled } 
																}))} 
																disabled={running} 
															/>
														</FormField>
														
														<FormField label="End Date">
															<Input 
																type="date" 
																value={override.end_date ?? ""} 
																onChange={(e) => setPerGameOverrides((s) => ({ 
																	...s, 
																	[game.app_id]: { ...override, end_date: e.target.value || undefined, enabled } 
																}))} 
																disabled={running} 
															/>
														</FormField>
													</FormGrid>
									</div>
								)}
										</Card>
						);
					})}
				</div>
						)}
					</TabsContent>
							</Tabs>
						</div>
					</CollapsibleContent>
				</Card>
			</Collapsible>
			{/* Desktop Features Section */}
			{activeGames.length > 0 && (
				<Collapsible open={exportOpen} onOpenChange={setExportOpen}>
					<Card>
						<CollapsibleTrigger asChild>
							<div className="flex items-center justify-between border-b border-border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
								<div>
									<h3 className="text-lg font-semibold">Export & Analysis</h3>
									<p className="text-sm text-muted-foreground">Export review data and analysis tools</p>
								</div>
							</div>
						</CollapsibleTrigger>
						<CollapsibleContent>
							<div className="p-4 space-y-6">
								{/* Game Selection */}
								<FormField 
									label="Select Game to Export" 
									description="Choose which game's reviews to export"
									required
								>
									<Select
										options={[
											{ label: "Select a game...", value: "", disabled: true },
											...activeGames.map(game => ({
												label: `${game.name} (${game.app_id})`,
												value: game.app_id.toString()
											}))
										]}
										value={selectedExportGame?.toString() || ""}
										onChange={(e) => setSelectedExportGame(e.target.value ? Number(e.target.value) : null)}
										placeholder="Select a game..."
									/>
								</FormField>

								{/* Export Buttons */}
								<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
									<Button
										variant="outline"
										className="flex flex-col h-auto p-4 items-start"
										onClick={() => handleExport("xlsx")}
										disabled={!selectedExportGame}
									>
										<div className="flex items-center gap-2 mb-2">
											<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10V6M12 6L9 9M12 6L15 9M12 10V14M12 18H16.5M12 18H7.5M3 18V8C3 6.89543 3.89543 6 5 6H19C20.1046 6 21 6.89543 21 8V18C21 19.1046 20.1046 20 19 20H5C3.89543 20 3 19.1046 3 18Z" />
											</svg>
											<span className="font-medium">Export XLSX</span>
										</div>
										<span className="text-xs text-muted-foreground text-left">
											Export as Excel file for advanced analysis
										</span>
									</Button>

									<Button
										variant="outline"
										className="flex flex-col h-auto p-4 items-start"
										onClick={() => handleExport("csv")}
										disabled={!selectedExportGame}
									>
										<div className="flex items-center gap-2 mb-2">
											<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z" />
										</svg>
										<span className="font-medium">Export CSV</span>
									</div>
									<span className="text-xs text-muted-foreground text-left">
										Export data as CSV for spreadsheet analysis
									</span>
								</Button>

									<Button
										variant="outline"
										className="flex flex-col h-auto p-4 items-start"
										disabled
									>
										<div className="flex items-center gap-2 mb-2">
											<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6L21 12L9 19Z" />
											</svg>
											<span className="font-medium">AI Analysis</span>
										</div>
										<span className="text-xs text-muted-foreground text-left">
											Analyze reviews with LLM (Coming Soon)
										</span>
									</Button>

									<Button
										variant="outline"
										className="flex flex-col h-auto p-4 items-start"
										disabled
									>
										<div className="flex items-center gap-2 mb-2">
											<svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12L3 8L7 4M17 12L21 8L17 4M13 20L11 4" />
											</svg>
											<span className="font-medium">Auto Scheduler</span>
										</div>
										<span className="text-xs text-muted-foreground text-left">
											Schedule automatic scraping (Coming Soon)
										</span>
									</Button>
								</div>

								{/* Quick Stats for Desktop */}
								{selectedExportGame && (
									<div className="mt-6 pt-4 border-t border-border">
										<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
											<div className="text-center">
												<div className="text-2xl font-bold text-blue-600">{totalScraped}</div>
												<div className="text-xs text-muted-foreground">Total Reviews Collected</div>
											</div>
											<div className="text-center">
												<div className="text-2xl font-bold text-green-600">{Math.round(rpmNow)}</div>
												<div className="text-xs text-muted-foreground">Current Rate (RPM)</div>
											</div>
											<div className="text-center">
												<div className="text-2xl font-bold text-purple-600">{activeGames.length}</div>
												<div className="text-xs text-muted-foreground">Games Queued</div>
											</div>
										</div>
									</div>
								)}
							</div>
						</CollapsibleContent>
					</Card>
				</Collapsible>
			)}
		</div>
	);
};