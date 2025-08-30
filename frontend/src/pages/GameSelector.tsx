import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SearchBar } from "../components/SearchBar";
import { GameList } from "../components/GameList";
import { ActiveList } from "../components/ActiveList";
import { Game, GameSearchResponse } from "../types";
import { addActiveGame, getActiveGames, removeActiveGame, searchGames, getBackfillStatus, startBackfill, getAppListStats } from "../api/games";
import { Card } from "../components/ui/Card";
import { RadialProgress } from "../components/ui/RadialProgress";
import { notifications } from "../utils/notifications";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button } from "../components/ui/Button";
import { ConfirmModal } from "../components/ConfirmModal";

export const GameSelector: React.FC = () => {
  const [searchResults, setSearchResults] = useState<Game[]>([]);
  const [totalResults, setTotalResults] = useState<number | undefined>(undefined);
  const [activeGames, setActiveGames] = useState<Game[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingActive, setLoadingActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<number | null>(null);
  const [backfillState, setBackfillState] = useState<string | null>(null);
  const [backfillTotal, setBackfillTotal] = useState<number | null>(null);
  const [backfillProcessed, setBackfillProcessed] = useState<number | null>(null);
  const [backfillError, setBackfillError] = useState<string | null>(null);
  const [applistCount, setApplistCount] = useState<number | null>(null);
  const [applistUpdated, setApplistUpdated] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // pagination
  const PAGE_SIZE = 200; // server allows larger windows; backend now supports up to 1000
  const [start, setStart] = useState(0);
  const [query, setQuery] = useState("");
  const [hasMore, setHasMore] = useState(false);

  const loadActive = useCallback(async () => {
    try {
      setLoadingActive(true);
      const data = await getActiveGames();
      setActiveGames(data);
      setLastRefreshed(Date.now());
    } catch (e: any) {
      const msg = e.message || "Failed to load active games";
      setError(msg);
      notifications.error(msg);
    } finally {
      setLoadingActive(false);
    }
  }, []);

  useEffect(() => {
    loadActive();
  }, [loadActive]);

  // Poll backfill status on mount so the UI can show progress for first-run
  useEffect(() => {
    let mounted = true;
    let timer: any;
    async function poll() {
      let resp: any = null;
      try {
        resp = await getBackfillStatus();
        if (!mounted) return;
        setBackfillState(resp.state || null);
        setBackfillTotal(typeof resp.total === "number" ? resp.total : null);
        setBackfillProcessed(typeof resp.processed === "number" ? resp.processed : null);
        setBackfillError(resp.error || null);
        // if backend provides timestamps, use finished_at for applist updated time
        if (resp.finished_at) {
          setApplistUpdated(new Date(resp.finished_at).toLocaleString());
        }
      } catch (e) {
        // ignore; keep polling in case of transient errors
      } finally {
        // Continue polling only while backfill is actively running or if we couldn't fetch status
        if (!resp || resp.state === "running") {
          timer = setTimeout(poll, 5000);
        }
      }
    }
    poll();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  // Fetch applist stats (reads DB) on mount
  const fetchAppListStats = useCallback(async () => {
    try {
      const stats = await getAppListStats();
      setApplistCount(typeof stats.count === "number" ? stats.count : null);
      setApplistUpdated(stats.last_seen ? new Date(stats.last_seen).toLocaleString() : null);
    } catch (e) {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchAppListStats();
  }, [fetchAppListStats]);

  const doSearch = useCallback(async (q: string, s = 0) => {
    try {
      setError(null);
      setLoadingSearch(true);
      const resp: GameSearchResponse = await searchGames(q, s, PAGE_SIZE);
      setSearchResults(resp.games);
      setTotalResults(resp.total);
      setHasMore(resp.games.length === PAGE_SIZE);
      setStart(s);
    } catch (e: any) {
      const msg = e.message || "Search failed";
      setError(msg);
      setSearchResults([]);
      setHasMore(false);
      notifications.error(msg);
    } finally {
      setLoadingSearch(false);
    }
  }, []);

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    await doSearch(q, 0);
  }, [doSearch]);

  const handleNext = useCallback(async () => {
    const nextStart = start + PAGE_SIZE;
    await doSearch(query, nextStart);
  }, [start, PAGE_SIZE, query, doSearch]);

  const handlePrev = useCallback(async () => {
    const prevStart = Math.max(0, start - PAGE_SIZE);
    await doSearch(query, prevStart);
  }, [start, PAGE_SIZE, query, doSearch]);

  const handleAdd = useCallback(async (game: Game) => {
    try {
      await addActiveGame(game);
      const updated = await getActiveGames();
      setActiveGames(updated);
      setLastRefreshed(Date.now());
      notifications.success(`Added ${game.name}`);
    } catch (e: any) {
      const msg = e.message || "Failed to add game";
      setError(msg);
      notifications.error(msg);
    }
  }, []);

  const handleRemove = useCallback(async (selectedIds: number[]) => {
    try {
      await Promise.all(selectedIds.map((id) => removeActiveGame(id)));
      const updated = await getActiveGames();
      setActiveGames(updated);
      setLastRefreshed(Date.now());
      notifications.success(`Removed ${selectedIds.length} ${selectedIds.length === 1 ? "game" : "games"}`);
    } catch (e: any) {
      const msg = e.message || "Failed to remove games";
      setError(msg);
      notifications.error(msg);
    }
  }, []);

  const activeCount = activeGames.length;
  const showingFrom = start + 1;
  const showingTo = start + searchResults.length;

  return (
    <div className="flex h-full w-full flex-col gap-6" data-testid="game-selector">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-1 text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-indigo-600">Game Selector</h1>
          <p className="text-sm text-muted">Search Steam and manage your active scraping list.</p>
        </div>
        <Button onClick={loadActive} variant="default" className="inline-flex items-center gap-2" aria-label="Refresh active games">
          <ArrowPathIcon className={`h-4 w-4 ${loadingActive ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-2 text-sm text-destructive-foreground" data-testid="error-banner">
          {error}
        </div>
      )}

      {/* Backfill status widget removed; applist info is shown in App List card */}

      {/* Quick stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Games</p>
              <p className="text-3xl font-bold">{activeCount}</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-600">
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2C7 1.44772 7.44772 1 8 1H16C16.5523 1 17 1.44772 17 2V4H20C20.5523 4 21 4.44772 21 5S20.5523 6 20 6H19V19C19 20.1046 18.1046 21 17 21H7C5.89543 21 5 20.1046 5 19V6H4C3.44772 6 3 5.55228 3 5S3.44772 4 4 4H7ZM9 8V17H11V8H9ZM13 8V17H15V8H13Z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Ready for scraping
          </div>
        </Card>
        
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">App List</p>
              <p className="text-3xl font-bold">{applistCount !== null ? applistCount : "–"}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={fetchAppListStats} aria-label="Refresh applist stats">
                Refresh
              </Button>
              <Button variant="default" size="sm" onClick={() => setConfirmOpen(true)} disabled={backfillState === "running"}>
                Update
              </Button>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Last updated: {applistUpdated ?? "Unknown"}
          </div>
        </Card>

        {/* Confirmation modal for starting a full backfill */}
        <ConfirmModal
          open={confirmOpen}
          title="Start App List Update"
          description="This will fetch the full Steam app list and upsert into the local DB. It may take several minutes. Proceed?"
          confirmLabel="Start"
          cancelLabel="Cancel"
          onClose={() => setConfirmOpen(false)}
          onConfirm={async () => {
            try {
              await startBackfill();
              notifications.success("App list update started");
            } catch (e: any) {
              notifications.error(e?.message || "Unable to start app list update. Please try again.");
            }
            // refresh stats after a small delay to pick up quick updates
            setTimeout(() => fetchAppListStats(), 2000);
          }}
        />
        
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Quick Tip</p>
              <p className="text-sm font-medium">Ready to Scrape</p>
            </div>
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-600">
              <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16H12V12H11M12 8H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" />
              </svg>
            </div>
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            Switch to Scraper tab when ready
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Search Section - Takes up 2/3 width on large screens */}
        <section className="lg:col-span-2 space-y-4">
          <Card>
            <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold">Steam Game Search</h3>
                <p className="text-sm text-muted-foreground">Search by game name or Steam App ID</p>
              </div>
              <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                {totalResults ? `${totalResults.toLocaleString()} games available` : "Ready to search"}
              </div>
            </div>
            
            <div className="space-y-4">
              <SearchBar onSearch={handleSearch} loading={loadingSearch} />
              
              {loadingSearch ? (
                <div className="space-y-3" data-testid="search-loading">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg">
                      <div className="h-12 w-12 bg-muted rounded-lg animate-pulse" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded animate-pulse w-2/3" />
                        <div className="h-3 bg-muted rounded animate-pulse w-1/3" />
                      </div>
                      <div className="h-8 w-16 bg-muted rounded animate-pulse" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <GameList games={searchResults} onAdd={handleAdd} activeGames={activeGames} total={totalResults} />

                  {/* Enhanced pagination */}
                  {searchResults.length > 0 && (
                    <div className="pt-4 border-t border-border">
                      <div className="text-sm text-muted-foreground">
                        Showing <span className="font-medium">{showingFrom}–{showingTo}</span>
                        {hasMore && <span> of many</span>}
                        {totalResults && totalResults <= showingTo && (
                          <span> of <span className="font-medium">{totalResults}</span></span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </Card>
        </section>

        {/* Active Games Section - Takes up 1/3 width on large screens */}
        <section className="space-y-4">
          <Card>
            <div className="flex items-center justify-between border-b border-border pb-4 mb-4">
              <div>
                <h3 className="text-lg font-semibold">Active Queue</h3>
                <p className="text-sm text-muted-foreground">Games ready for scraping</p>
              </div>
              <Button
                onClick={loadActive}
                variant="ghost"
                size="sm"
                disabled={loadingActive}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowPathIcon className={`h-4 w-4 ${loadingActive ? "animate-spin" : ""}`} />
              </Button>
            </div>
            
            <div className="space-y-3">
              <ActiveList games={activeGames} onRemove={handleRemove} />
              {loadingActive && (
                <div className="flex items-center justify-center py-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                    Refreshing...
                  </div>
                </div>
              )}
              
              {activeGames.length === 0 && !loadingActive && (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="mb-2">
                    <svg className="mx-auto h-12 w-12 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 11H5M12 5L5 12L12 19" />
                    </svg>
                  </div>
                  <div className="text-sm">No games selected</div>
                  <div className="text-xs mt-1">Search and add games to get started</div>
                </div>
              )}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
};