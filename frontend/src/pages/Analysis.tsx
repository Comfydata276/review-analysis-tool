import React, {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { getActiveGames, searchGames } from "../api/games";
import { previewAnalysis, getAnalysisSettings, saveAnalysisSettings, deleteAnalysisSettings } from "../api/analysis";
import {
	startScraper,
}
from "../api/scraper";
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
import { ChevronDownIcon } from "@heroicons/react/24/outline";

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

export const Analysis: React.FC = () => {
 	const [selectedGame, setSelectedGame] = useState<Game | null>(null);
 	const [gameQuery, setGameQuery] = useState<string>("");
 	const [gameSuggestions, setGameSuggestions] = useState<Game[]>([]);
 	const [loadingSuggestions, setLoadingSuggestions] = useState<boolean>(false);
 	const [debouncedQuery, setDebouncedQuery] = useState<string>("");

	// preview state
	const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
	const [previewError, setPreviewError] = useState<string | null>(null);
	const [previewTotal, setPreviewTotal] = useState<number | null>(null);
	const [previewSamples, setPreviewSamples] = useState<any[]>([]);

	// Debounce the query to avoid excessive requests while typing
	useEffect(() => {
		const t = setTimeout(() => setDebouncedQuery((gameQuery || "").trim()), 300);
		return () => clearTimeout(t);
	}, [gameQuery]);

	useEffect(() => {
		let cancelled = false;
		const q = debouncedQuery;
		if (!q) {
			setGameSuggestions([]);
			return;
		}

		async function fetchSuggestions() {
			try {
				setLoadingSuggestions(true);
				const resp = await searchGames(q, 0, 50);
				if (!cancelled) setGameSuggestions(resp.games || []);
			} catch (e) {
				if (!cancelled) setGameSuggestions([]);
			} finally {
				if (!cancelled) setLoadingSuggestions(false);
			}
		}

		fetchSuggestions();
		return () => {
			cancelled = true;
		};
	}, [debouncedQuery]);
 	const [activeGames, setActiveGames] = useState<Game[]>([]);
 	const [status, setStatus] = useState<any | null>(null);
 	const [isLoadingStatus, setIsLoadingStatus] = useState(false);
 	const [error, setError] = useState<string | null>(null);
 	const [running, setRunning] = useState(false);
 	const [history, setHistory] = useState<Point[]>([]);
 	const [settingsTab, setSettingsTab] = useState("global");
 	const [configurationOpen, setConfigurationOpen] = useState(true);
 	const [exportOpen, setExportOpen] = useState(false);
 	const [selectedExportGame, setSelectedExportGame] = useState<number | null>(null);
 	const [reviewsAvailable, setReviewsAvailable] = useState<number | null>(null);
 	const [steamTotalReviews, setSteamTotalReviews] = useState<number | null>(null);

 	const [globalSettings, setGlobalSettings] =
 		useState<any>({
 			max_reviews: 1000,
 			complete_scraping: false,
 			language: "english",
 			start_date: undefined,
 			end_date: undefined,
 			min_playtime: undefined,
 			max_playtime: undefined,
 			reviews_per_batch: 1,
 			batches_per_request: 1,
 			early_access: "include",
 			received_for_free: "include",
 		});

    const DEFAULT_GLOBAL_SETTINGS = {
        max_reviews: 1000,
        complete_scraping: false,
        language: "english",
        start_date: undefined,
        end_date: undefined,
        min_playtime: undefined,
        max_playtime: undefined,
        reviews_per_batch: 1,
        batches_per_request: 1,
        early_access: "include",
        received_for_free: "include",
    };


 	const [perGameOverrides, setPerGameOverrides] = useState<
 		Record<number, Partial<any> & { enabled?: boolean }>
 	>({});
 
 	// used to skip autosave while initial settings are loading
 	const skipSaveRef = useRef(true);
 	const saveTimerRef = useRef<number | null>(null);
 
 	// Load persisted settings from server (preferred) then localStorage fallback
 	useEffect(() => {
 		let cancelled = false;

 		async function loadSettings() {
 			// try server first
 			try {
 				const srv = await getAnalysisSettings();
 				if (!cancelled && srv && typeof srv === "object" && Object.keys(srv).length > 0) {
 					if (srv.global_settings) setGlobalSettings(srv.global_settings);
 					if (srv.per_game_overrides) setPerGameOverrides(srv.per_game_overrides);
 					// UI state
 					if (srv.ui) {
 						if (srv.ui.settingsTab) setSettingsTab(srv.ui.settingsTab);
 						if (typeof srv.ui.configurationOpen === "boolean") setConfigurationOpen(srv.ui.configurationOpen);
 						if (typeof srv.ui.exportOpen === "boolean") setExportOpen(srv.ui.exportOpen);
 						if (srv.ui.selectedExportGame) setSelectedExportGame(Number(srv.ui.selectedExportGame));
 					}
 					skipSaveRef.current = false; // Allow autosave after loading
 					return;
 				}
 			} catch (e) {
 				// server failed, fall back to localStorage
 			}

 			// localStorage fallback
 			try {
 				const gRaw = localStorage.getItem("analysis:globalSettings");
 				if (gRaw) {
 					setGlobalSettings(JSON.parse(gRaw));
 				}
 				const pRaw = localStorage.getItem("analysis:perGameOverrides");
 				if (pRaw) {
 					setPerGameOverrides(JSON.parse(pRaw));
 				}

 				// UI state
 				const tab = localStorage.getItem("analysis:settingsTab");
 				if (tab) setSettingsTab(tab);
 				const cfg = localStorage.getItem("analysis:configurationOpen");
 				if (cfg !== null) setConfigurationOpen(cfg === "true");
 				const exp = localStorage.getItem("analysis:exportOpen");
 				if (exp !== null) setExportOpen(exp === "true");
 				const sel = localStorage.getItem("analysis:selectedExportGame");
 				if (sel) {
 					const n = Number(sel);
 					if (!isNaN(n)) setSelectedExportGame(n);
 				}
 				skipSaveRef.current = false; // Allow autosave after loading
 			} catch (e) {
 				// ignore
 			}
 		}

 		loadSettings();

 		return () => {
 			cancelled = true;
 		};
 	}, []);

 	// Persist settings when changed
 	useEffect(() => {
 		try {
 			localStorage.setItem("analysis:globalSettings", JSON.stringify(globalSettings));
 		} catch (e) {}
 	}, [globalSettings]);

 	useEffect(() => {
 		try {
 			localStorage.setItem("analysis:perGameOverrides", JSON.stringify(perGameOverrides));
 		} catch (e) {}
 	}, [perGameOverrides]);

 	// Persist UI state
 	useEffect(() => {
 		try {
 			localStorage.setItem("analysis:settingsTab", settingsTab);
 		} catch (e) {}
 	}, [settingsTab]);

 	useEffect(() => {
 		try {
 			localStorage.setItem("analysis:configurationOpen", configurationOpen ? "true" : "false");
 		} catch (e) {}
 	}, [configurationOpen]);

 	useEffect(() => {
 		try {
 			localStorage.setItem("analysis:exportOpen", exportOpen ? "true" : "false");
 		} catch (e) {}
 	}, [exportOpen]);

 	useEffect(() => {
 		try {
 			if (selectedExportGame === null) {
 				localStorage.removeItem("analysis:selectedExportGame");
 			} else {
 				localStorage.setItem("analysis:selectedExportGame", String(selectedExportGame));
 			}
 		} catch (e) {}
 	}, [selectedExportGame]);

 	// Debounced autosave to server (also keeps localStorage via existing effects)
 	useEffect(() => {
 		// skip autosave during initial load
 		if (skipSaveRef.current) return;

 		if (saveTimerRef.current) {
 			window.clearTimeout(saveTimerRef.current);
 		}

 		saveTimerRef.current = window.setTimeout(async () => {
 			const payload = {
 				global_settings: globalSettings,
 				per_game_overrides: perGameOverrides,
 				ui: {
 					settingsTab,
 					configurationOpen,
 					exportOpen,
 					selectedExportGame,
 				},
 			};
 			try {
 				await saveAnalysisSettings(payload);
 			} catch (e: any) {
 				console.error("Failed to save analysis settings", e);
 				toast.error("Failed to save settings to server");
 			}
 		}, 1000);

 		return () => {
 			if (saveTimerRef.current) {
 				window.clearTimeout(saveTimerRef.current);
 				saveTimerRef.current = null;
 			}
 		};
 	}, [globalSettings, perGameOverrides, settingsTab, configurationOpen, exportOpen, selectedExportGame]);

 	const resetSettings = () => {
 		setGlobalSettings({ ...DEFAULT_GLOBAL_SETTINGS });
 		setPerGameOverrides({});
 		// reset UI state as well
 		setSettingsTab("global");
 		setConfigurationOpen(true);
 		setExportOpen(false);
 		setSelectedExportGame(null);
 		try {
 			localStorage.removeItem("analysis:globalSettings");
 			localStorage.removeItem("analysis:perGameOverrides");
 			localStorage.removeItem("analysis:settingsTab");
 			localStorage.removeItem("analysis:configurationOpen");
 			localStorage.removeItem("analysis:exportOpen");
 			localStorage.removeItem("analysis:selectedExportGame");
 		} catch (e) {
 			// ignore
 		}

 		// also clear server settings
 		(async () => {
 			try {
 				await deleteAnalysisSettings();
 				toast.success("Server settings cleared");
 			} catch (e) {
 				// non-fatal
 			}
 		})();
 	};

 	useEffect(() => {
 		getActiveGames()
 			.then((games) => {
 				setActiveGames(games);
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

 	const rpmNow = Math.max(0, Math.round(history[history.length - 1]?.rpm || 0));
 	const totalScraped = status?.global_progress?.scraped || 0;

 	const handleExport = useCallback(async (format: "csv" | "xlsx") => {
 		if (!selectedExportGame) {
 			toast.error("Please select a game to export reviews for.");
 			return;
 		}

 		try {
 			const selectedGame = activeGames.find(g => g.app_id === selectedExportGame);
 			const gameName = selectedGame?.name || `Game_${selectedExportGame}`;

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

 	useEffect(() => {
 		let cancelled = false;
 		async function fetchCount() {
 			if (!selectedExportGame) {
 				setReviewsAvailable(null);
 				return;
 			}
 			try {
 				const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
 				const res = await fetch(`${BACKEND_URL}/reviews/count/${selectedExportGame}`);
 				if (!res.ok) {
 					setReviewsAvailable(null);
 					return;
 				}
 				const data = await res.json();
 				if (!cancelled) setReviewsAvailable(Number(data.count || 0));
 			} catch (e) {
 				if (!cancelled) setReviewsAvailable(null);
 			}
 		}
 		fetchCount();

 		async function fetchSteamTotal() {
 			if (!selectedExportGame) {
 				setSteamTotalReviews(null);
 				return;
 			}
 			try {
 				const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
 				const res = await fetch(`${BACKEND_URL}/games/steam_reviews/${selectedExportGame}`);
 				if (!res.ok) {
 					setSteamTotalReviews(null);
 					return;
 				}
 				const data = await res.json();
 				if (!cancelled) setSteamTotalReviews(Number(data.steam_total_reviews || 0));
 			} catch (e) {
 				if (!cancelled) setSteamTotalReviews(null);
 			}
 		}
 		fetchSteamTotal();
 		return () => { cancelled = true; };
 	}, [selectedExportGame]);

 	const prevRunningRef = React.useRef<boolean>(running);
 	useEffect(() => {
 		const prev = prevRunningRef.current;
 		if (prev && !running && selectedExportGame) {
 			let cancelled = false;
 			(async () => {
 				try {
 					const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
 					const [steamRes, dbRes] = await Promise.all([
 						fetch(`${BACKEND_URL}/games/steam_reviews/${selectedExportGame}`),
 						fetch(`${BACKEND_URL}/reviews/count/${selectedExportGame}`),
 					]);
 					let steamCount: number | null = null;
 					let dbCount: number | null = null;
 					if (steamRes.ok) {
 						const d = await steamRes.json();
 						steamCount = Number(d.steam_total_reviews || 0);
 						if (!cancelled) setSteamTotalReviews(steamCount);
 					}
 					if (dbRes.ok) {
 						const d2 = await dbRes.json();
 						dbCount = Number(d2.count || 0);
 						if (!cancelled) setReviewsAvailable(dbCount);
 					}
 					if (!cancelled) {
 						const parts: string[] = [];
 						if (steamCount !== null) parts.push(`${steamCount} on Steam`);
 						if (dbCount !== null) parts.push(`${dbCount} in DB`);
 						if (parts.length > 0) toast.success(`Review counts updated: ${parts.join(", ")}`);
 					}
 				} catch (e) {
 					if (!cancelled) toast.error("Failed to refresh review counts");
 				}
 			})();
 			return () => {
 				cancelled = true;
 			};
 		}
 		prevRunningRef.current = running;
 	}, [running, selectedExportGame]);

 	// Validation: ensure max_playtime (when set) is strictly greater than min_playtime (when set)
 	const playtimeError: string | undefined = (() => {
 		const min = globalSettings.min_playtime;
 		const max = globalSettings.max_playtime;
 		if (min !== undefined && max !== undefined && max !== "" && max <= min) {
 			return "Max playtime must be greater than Min playtime";
 		}
 		return undefined;
 	})();

 	return (
 		<div className="space-y-6 p-0" data-testid="analysis-page">

 			<div className="flex items-center justify-between">
 				<div>
 					<h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-indigo-600">Analysis</h1>
 					<p className="text-sm text-muted-foreground">Run analysis over reviews stored locally in the database.</p>
 				</div>
 				<div className="flex items-center gap-3">
				{/* Preview controls */}
				<Button
					variant="gradient"
					onClick={async () => {
						setPreviewError(null);
						setIsPreviewLoading(true);
						try {
							if (!selectedGame) {
								setPreviewError("Please select a game from the suggestions before previewing.");
								return;
							}
							const payload: any = {
								global_settings: {
									app_id: selectedGame.app_id,
									language: globalSettings.language,
									start_date: globalSettings.start_date || undefined,
									end_date: globalSettings.end_date || undefined,
									min_playtime: globalSettings.min_playtime,
									max_playtime: globalSettings.max_playtime,
									early_access: globalSettings.early_access,
									received_for_free: globalSettings.received_for_free,
									max_reviews: globalSettings.complete_scraping ? undefined : globalSettings.max_reviews,
									complete_analysis: globalSettings.complete_scraping,
								},
								limit: 50,
							};
							const res = await previewAnalysis(payload as any);
							setPreviewTotal(res.total_reviews || 0);
							setPreviewSamples(res.sample_reviews || []);
						} catch (e: any) {
							setPreviewError(e.message || String(e));
						} finally {
							setIsPreviewLoading(false);
						}
					}}
					disabled={isPreviewLoading || !selectedGame}
				>
					{isPreviewLoading ? "Loading..." : "Run Preview Analysis"}
				</Button>

				<div className="flex items-center gap-2">
 					<div className={cn(
 						"h-2 w-2 rounded-full",
 						running ? "bg-green-500 animate-pulse" : "bg-gray-400"
 					)} />
 					<span className="text-sm text-muted-foreground">
 						{running ? "Running" : "Idle"}
 					</span>
 				</div>

 					<Button 
 						variant="gradient"
 						onClick={() => { /* Placeholder for analysis start */ }}
 						disabled={!selectedGame}
 						className="inline-flex items-center gap-2" 
 					>
 						<PlayIcon className="h-4 w-4" />
 						Run Analysis
 					</Button>

 					<Button 
 						variant="destructive" 
 						className="inline-flex items-center gap-2" 
 						disabled={!running}
 					>
 						<StopIcon className="h-4 w-4" />
 						Stop
 					</Button>
 				</div>
 			</div>

 			{/* Stats */}
 			<div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
 				<Card title="Global Progress">
 					<div className="flex items-center justify-center">
 						<RadialProgress value={0} label="Global" className="text-blue-600" />
 					</div>
 					<div className="mt-3 text-center text-sm text-gray-600 dark:text-gray-400">ETA --</div>
 				</Card>

 				<Card title="Current Game">
 					<div className="flex items-center justify-center">
 						<RadialProgress value={0} label="Current" className="text-green-600" />
 					</div>
 					<div className="mt-2 truncate text-center text-xs text-gray-600 dark:text-gray-400">Idle</div>
 					<div className="mt-1 text-center text-sm text-gray-600 dark:text-gray-400">ETA --</div>
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
 							<span className="text-gray-600 dark:text-gray-400">Active games</span>
 							<span className="font-medium">{activeGames.length}</span>
 						</div>
 					</div>
 				</Card>
 			</div>


 			{/* Settings */}
 			<Collapsible open={configurationOpen} onOpenChange={setConfigurationOpen}>
 				<Card>
 					<CollapsibleTrigger asChild>
 						<div className="flex items-center justify-between border-b border-border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
 							<div>
 								<h3 className="text-lg font-semibold">Configuration</h3>
 								<p className="text-sm text-muted-foreground">Configure analysis settings and per-game overrides</p>
 							</div>
 							<ChevronDownIcon className={cn("h-4 w-4", configurationOpen ? "rotate-180" : "")} />
 						</div>
 					</CollapsibleTrigger>
 					<CollapsibleContent>
 						<div className="p-4">
 							<Tabs value={settingsTab} onValueChange={setSettingsTab}>
 							<TabsContent value="global" className="space-y-6">
 								<FormSection 
 									title="Basic Settings" 
 									description="Configure the main analysis parameters"
 									actions={(
 									<Button variant="outline" onClick={() => {
 										setGlobalSettings({ ...DEFAULT_GLOBAL_SETTINGS });
 										setPerGameOverrides({});
 										setSettingsTab("global");
 										setConfigurationOpen(true);
 										setExportOpen(false);
 										setSelectedExportGame(null);
 									}} size="sm">Reset to defaults</Button>
 								)}
 								>
 									{/* Game picker on its own row */}
						<div className="mb-6">
							<FormField label="Game" description="Select a game to analyse (type to search AppID or name)" required>
								<div className="relative max-w-md">
									<Input
										value={gameQuery}
										placeholder="Type game name or AppID"
										onChange={(e) => { setGameQuery(e.target.value); setSelectedGame(null); }}
									/>
									{gameSuggestions.length > 0 && (
										<div className="absolute z-40 mt-1 w-full rounded-md border bg-card shadow max-h-60 overflow-auto">
											{gameSuggestions.map((g) => (
												<button key={g.app_id} className="block w-full text-left px-3 py-2 hover:bg-accent" onClick={() => { setSelectedGame(g); setGameQuery(`${g.name} (${g.app_id})`); setGameSuggestions([]); }}>
													<div className="text-sm font-medium">{g.name}</div>
													<div className="text-xs text-muted-foreground">AppID: {g.app_id}</div>
												</button>
											))}
										</div>
									)}
								</div>
							</FormField>
						</div>

 						<FormGrid cols={3}>
 							<FormField label="Max Reviews per Game" description="Maximum number of reviews to analyse per game" required>
								<Input
									value={globalSettings.max_reviews ?? ""}
									onChange={(e) => {
									const v = e.target.value;
									if (v === "") {
										setGlobalSettings((s: any) => ({ ...s, max_reviews: undefined }));
									} else {
										const cleaned = v.replace(/^0+(\d)/, "$1");
										setGlobalSettings((s: any) => ({ ...s, max_reviews: Number(cleaned) }));
									}
								}}
								data-testid="max-reviews"
								disabled={!!globalSettings.complete_scraping}
								/>
							</FormField>

							<FormField label="Complete Analysis" description="When enabled, analyse all available reviews and disable Max Reviews per Game">
								<div>
									<Button
										variant={globalSettings.complete_scraping ? "gradient" : "outline"}
										size="md"
										onClick={() => setGlobalSettings((s: any) => ({ ...s, complete_scraping: !s.complete_scraping }))}
										aria-pressed={!!globalSettings.complete_scraping}
										className="w-full h-10"
									>
										{globalSettings.complete_scraping ? "Disable complete analysis" : "Enable complete analysis"}
									</Button>
								</div>
							</FormField>

							<FormField label="Reviews Per Batch" description="Number of reviews per batch" required>
								<Input
									type="number"
									min="1"
									value={globalSettings.reviews_per_batch}
									onChange={(e) => setGlobalSettings((s: any) => ({ ...s, reviews_per_batch: Number(e.target.value) }))}
									data-testid="reviews-per-batch"
								/>
							</FormField>
						</FormGrid>

 						{/* Batches Per Request row (single-column width) */}
 						<FormGrid cols={3}>
 							<FormField label="Batches Per Request" description="Number of batches per request">
 								<Input type="number" min="1" value={globalSettings.batches_per_request} onChange={(e) => setGlobalSettings((s: any) => ({ ...s, batches_per_request: Number(e.target.value) }))} />
 							</FormField>
 							<div />
 							<div />
 						</FormGrid>
 								</FormSection>

 								<FormSection 
 									title="Filtering"
 									description="Language, date range and content filters"
 								>
 									{/* Row 1: Language, Start Date, End Date */}
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
 											onChange={(e) => setGlobalSettings((s: any) => ({ ...s, language: e.target.value }))}
 											disabled={false}
 											data-testid="language"
 										/>
 										</FormField>

 										<FormField label="Start Date" description="Only include reviews after this date">
 											<Input
 												type="date"
 												value={globalSettings.start_date || ""}
 												onChange={(e) => setGlobalSettings((s: any) => ({ ...s, start_date: e.target.value || undefined }))}
 												disabled={false}
 											data-testid="start-date"
 											/>
 										</FormField>

 										<FormField label="End Date" description="Only include reviews before this date">
 											<Input
 												type="date"
 												value={globalSettings.end_date || ""}
 												onChange={(e) => setGlobalSettings((s: any) => ({ ...s, end_date: e.target.value || undefined }))}
 												disabled={false}
 											data-testid="end-date"
 											/>
 										</FormField>
 									</FormGrid>

 									{/* Row 2: Min Playtime, Max Playtime, Early Access */}
 									<FormGrid cols={3}>
 										<FormField label="Min Playtime (hours)" description="Only include reviews with at least this many hours played">
 											<Input
 												type="number"
 												min="0"
 												step="0.1"
 												value={globalSettings.min_playtime ?? ""}
 												onChange={(e) => setGlobalSettings((s: any) => ({ ...s, min_playtime: e.target.value === "" ? undefined : Number(e.target.value) }))}
 												disabled={false}
 												data-testid="min-playtime"
 											/>
 										</FormField>

 										<FormField label="Max Playtime (hours)" description="Only include reviews with no more than this many hours played" error={playtimeError}>
 											<Input
 												type="number"
 												min="0"
 												step="0.1"
 												value={globalSettings.max_playtime ?? ""}
 												onChange={(e) => setGlobalSettings((s: any) => ({ ...s, max_playtime: e.target.value === "" ? undefined : Number(e.target.value) }))}
 												disabled={false}
 												data-testid="max-playtime"
 												error={!!playtimeError}
 												aria-invalid={!!playtimeError}
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
 											onChange={(e) => setGlobalSettings((s: any) => ({ ...s, early_access: e.target.value as any }))}
 											disabled={false}
 											data-testid="early-access"
 										/>
 									</FormField>
 								</FormGrid>

 								{/* Row 3: Received for free */}
 								<FormGrid cols={3}>
 									<FormField label="Received for Free" description="Include games received for free">
 										<Select
 											options={[{ label: "Include", value: "include" }, { label: "Exclude", value: "exclude" }, { label: "Only", value: "only" }]}
 											value={globalSettings.received_for_free}
 											onChange={(e) => setGlobalSettings((s: any) => ({ ...s, received_for_free: e.target.value as any }))}
 										/>
 									</FormField>
 									{/* empty columns to keep layout */}
 									<div />
 									<div />
 								</FormGrid>
 							</FormSection>
 							</TabsContent>
 							</Tabs>
 							</div>
 					</CollapsibleContent>
 					</Card>
 			</Collapsible>

 			{activeGames.length > 0 && (
 				<Collapsible open={exportOpen} onOpenChange={setExportOpen}>
 					<Card>
 						<CollapsibleTrigger asChild>
 							<div className="flex items-center justify-between border-b border-border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
 								<div>
 									<h3 className="text-lg font-semibold">Export & Analysis</h3>
 									<p className="text-sm text-muted-foreground">Export analysed review data and analysis tools</p>
 								</div>
 								<ChevronDownIcon className={cn("h-4 w-4", exportOpen ? "rotate-180" : "")} />
 							</div>
 						</CollapsibleTrigger>
 						<CollapsibleContent>
 							<div className="p-4 space-y-6">
 								<FormField 
 									label="Select Game to Export" 
 									description="Choose which game's reviews to export"
 									required
 								>
 									<Select
 										options={[
 											...activeGames.map(game => ({
 												label: `${game.name} (${game.app_id})`,
 												value: game.app_id.toString()
 											}))
 										]
 										}
 										value={selectedExportGame?.toString() || ""}
 										onChange={(e) => setSelectedExportGame(e.target.value ? Number(e.target.value) : null)}
 										placeholder="Select a game to export"
 									/>
 								</FormField>

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

 								{selectedExportGame && (
 									<div className="mt-6 pt-4 border-t border-border">
 										<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
 											<div className="text-center">
 												<div className="text-2xl font-bold text-blue-600">{reviewsAvailable ?? totalScraped}</div>
 												<div className="text-xs text-muted-foreground">Reviews available to export</div>
 											</div>
 											<div className="text-center">
 												<div className="text-2xl font-bold text-green-600">{steamTotalReviews ?? 0}</div>
 												<div className="text-xs text-muted-foreground">Steam total reviews</div>
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

export default Analysis;


