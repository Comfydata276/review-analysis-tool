import React, { useCallback, useEffect, useMemo, useState } from "react";
import { SearchBar } from "../components/SearchBar";
import { GameList } from "../components/GameList";
import { ActiveList } from "../components/ActiveList";
import { Game, GameSearchResponse } from "../types";
import { addActiveGame, getActiveGames, removeActiveGame, searchGames } from "../api/games";
import { Card } from "../components/ui/Card";
import { RadialProgress } from "../components/ui/RadialProgress";
import toast from "react-hot-toast";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { Button } from "../components/ui/Button";

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
      toast.error(msg);
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
      toast.error(msg);
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
      toast.success(`Added ${game.name}`);
    } catch (e: any) {
      const msg = e.message || "Failed to add game";
      setError(msg);
      toast.error(msg);
    }
  }, []);

  const handleRemove = useCallback(async (selectedIds: number[]) => {
    try {
      await Promise.all(selectedIds.map((id) => removeActiveGame(id)));
      const updated = await getActiveGames();
      setActiveGames(updated);
      setLastRefreshed(Date.now());
      toast.success(`Removed ${selectedIds.length} ${selectedIds.length === 1 ? "game" : "games"}`);
    } catch (e: any) {
      const msg = e.message || "Failed to remove games";
      setError(msg);
      toast.error(msg);
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

      {/* Backfill status */}
      {backfillState && backfillState !== "done" && (
        <Card title="Indexing Steam apps" subtitle={backfillState === "running" ? `Populating ${backfillProcessed ?? "?"}/${backfillTotal ?? "?"}` : `Status: ${backfillState}`}>
          <div className="flex items-center gap-4">
            <RadialProgress value={backfillTotal ? Math.floor(((backfillProcessed || 0) / backfillTotal) * 100) : 0} size={64} stroke={8} />
            <div className="text-sm">
              {backfillState === "running" ? (
                <div>Populating local Steam app list ({backfillProcessed ?? "?"}/{backfillTotal ?? "?"})</div>
              ) : (
                <div>Backfill status: {backfillState}. {backfillError && <span className="text-destructive">{backfillError}</span>}</div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card title="Active games">
          <div className="text-2xl font-semibold">{activeCount}</div>
        </Card>
        <Card title="Last refreshed">
          <div className="text-sm">{lastRefreshed ? new Date(lastRefreshed).toLocaleString() : "—"}</div>
        </Card>
        <Card title="Tip">
          <div className="text-sm text-muted-foreground">Add games to start scraping on the Scraper tab.</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="space-y-3">
          <Card title="Search" actions={<span className="text-xs text-muted-foreground">Search by name or AppID</span>}>
            <SearchBar onSearch={handleSearch} loading={loadingSearch} />
            <div className="mt-3">
              {loadingSearch ? (
                <div className="space-y-2" data-testid="search-loading">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded bg-card/30" />
                  ))}
                </div>
              ) : (
                <>
                  <GameList games={searchResults} onAdd={handleAdd} activeGames={activeGames} total={totalResults} />

                  {/* pagination controls */}
                  <div className="mt-3 flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">
                      {searchResults.length > 0 ? `Showing ${showingFrom}–${showingTo}${hasMore ? "+" : ""}` : "No results"}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={handlePrev} disabled={start === 0 || loadingSearch}>
                        Previous
                      </Button>
                      <Button variant="outline" onClick={handleNext} disabled={!hasMore || loadingSearch}>
                        Next
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </Card>
        </section>

        <section className="space-y-3">
          <Card title="Active List" subtitle="Manage which games are queued for scraping">
            <ActiveList games={activeGames} onRemove={handleRemove} />
            {loadingActive && (
              <div className="mt-2 text-sm text-muted-foreground" data-testid="active-loading">Refreshing...</div>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
};