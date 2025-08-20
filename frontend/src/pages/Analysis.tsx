import React, { useState, useEffect } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { FormField, FormSection, FormGrid } from "../components/ui/FormField";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "../components/ui/Collapsible";
import { ChevronDownIcon } from "@heroicons/react/24/outline";
import { previewAnalysis } from "../api/analysis";
import { searchGames } from "../api/games";
import { Game } from "../types";

type SampleReview = { review_id: string; app_id: number; review_text: string };

export const Analysis: React.FC = () => {
  const [maxReviews, setMaxReviews] = useState<string>("1000");
  const [selectedGame, setSelectedGame] = useState<Game | null>(null);
  const [gameQuery, setGameQuery] = useState<string>("");
  const [gameSuggestions, setGameSuggestions] = useState<Game[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState<boolean>(false);
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");

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
  const [simultaneousBatching, setSimultaneousBatching] = useState<string>("4");
  const [language, setLanguage] = useState<string>("English");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [minPlaytime, setMinPlaytime] = useState<string>("");
  const [maxPlaytime, setMaxPlaytime] = useState<string>("");
  const [earlyAccess, setEarlyAccess] = useState<string>("include");
  const [freeGames, setFreeGames] = useState<string>("include");
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewTotal, setPreviewTotal] = useState<number | null>(null);
  const [previewSamples, setPreviewSamples] = useState<SampleReview[]>([]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analysis</h1>
          <p className="text-muted-foreground mt-1">Run analysis over reviews stored locally in the database.</p>
        </div>
        <div className="flex items-center gap-3">
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
                  app_id: selectedGame.app_id,
                  language: language === "Any" ? undefined : (language || "").toLowerCase(),
                  start_date: startDate || undefined,
                  end_date: endDate || undefined,
                  min_playtime: minPlaytime ? Number(minPlaytime) : undefined,
                  max_playtime: maxPlaytime ? Number(maxPlaytime) : undefined,
                  early_access: earlyAccess,
                  received_for_free: freeGames,
                  max_reviews: maxReviews ? Number(maxReviews) : undefined,
                  limit: 50,
                };

                const res = await previewAnalysis(payload as any);
                setPreviewTotal(res.total || 0);
                setPreviewSamples((res.reviews || []).map((r: any) => ({ review_id: r.review_id, app_id: r.app_id, review_text: r.review_text })));
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
          <Button variant="gradient" onClick={() => { /* Intentionally unwired for now */ }}>
            Start Full Analysis
          </Button>
        </div>
      </div>

      <Card>
        <div className="p-6">
          <Collapsible>
            <div className="flex items-center justify-between mb-4">
              <CollapsibleTrigger className="flex-1 text-left">
                <div>
                  <h3 className="text-lg font-semibold">Configuration</h3>
                  <p className="text-sm text-muted-foreground">Configure the analysis parameters</p>
                </div>
              </CollapsibleTrigger>

              <div className="flex items-center gap-3 ml-6">
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
                      // Build payload matching backend preview expectations (flat fields)
                      const payload: any = {
                        app_id: selectedGame.app_id,
                        language: language === "Any" ? undefined : (language || "").toLowerCase(),
                        start_date: startDate || undefined,
                        end_date: endDate || undefined,
                        min_playtime: minPlaytime ? Number(minPlaytime) : undefined,
                        max_playtime: maxPlaytime ? Number(maxPlaytime) : undefined,
                        early_access: earlyAccess,
                        received_for_free: freeGames,
                        max_reviews: maxReviews ? Number(maxReviews) : undefined,
                        limit: 50,
                      };

                      const res = await previewAnalysis(payload as any);
                      setPreviewTotal(res.total || 0);
                      setPreviewSamples(
                        (res.reviews || []).map((r: any) => ({ review_id: r.review_id, app_id: r.app_id, review_text: r.review_text }))
                      );
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
                <Button variant="gradient" onClick={() => { /* Intentionally unwired for now */ }}>
                  Start Full Analysis
                </Button>
              </div>
            </div>

            <CollapsibleContent>
              <FormSection title="Basic Settings" description="Configure the main analysis parameters">
                <FormGrid cols={3}>
              <FormField label="Game" description="Select a game to analyse (type to search AppID or name)">
                <div className="relative">
                  <Input
                    value={gameQuery}
                    placeholder="Type game name or AppID"
                    onChange={(e) => {
                      setGameQuery(e.target.value);
                      setSelectedGame(null);
                    }}
                  />
                  {gameSuggestions.length > 0 && (
                    <div className="absolute z-40 mt-1 w-full rounded-md border bg-card shadow max-h-60 overflow-auto">
                      {gameSuggestions.map((g) => (
                        <button
                          key={g.app_id}
                          className="block w-full text-left px-3 py-2 hover:bg-accent"
                          onClick={() => {
                            setSelectedGame(g);
                            setGameQuery(`${g.name} (${g.app_id})`);
                            setGameSuggestions([]);
                          }}
                        >
                          <div className="text-sm font-medium">{g.name}</div>
                          <div className="text-xs text-muted-foreground">AppID: {g.app_id}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </FormField>

              <FormField label="Max Reviews per Game" description="Maximum number of reviews to analyse per game">
                <Input value={maxReviews} onChange={(e) => setMaxReviews(e.target.value)} />
              </FormField>

              <FormField label="Simultaneous Batching" description="Maximum concurrent LLM batch requests">
                <Input value={simultaneousBatching} onChange={(e) => setSimultaneousBatching(e.target.value)} />
              </FormField>

              <FormField label="(LLM selector)" description="Select which LLM provider to use on the LLM settings page">
                <div className="text-sm text-muted-foreground">Use the LLM selector page to choose provider and credentials.</div>
              </FormField>
            </FormGrid>
          </FormSection>

          <FormSection title="Filtering" description="Language, date range and content filters">
            <FormGrid cols={3}>
              <FormField label="Language" description="Review language preference">
                <Select
                  options={[{ value: "English", label: "English" }, { value: "Any", label: "Any" }]}
                  value={language}
                  onChange={(e: any) => setLanguage(e.target.value)}
                />
              </FormField>

              <FormField label="Start Date" description="Only include reviews after this date">
                <Input placeholder="YYYY-MM-DD" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </FormField>

              <FormField label="End Date" description="Only include reviews before this date">
                <Input placeholder="YYYY-MM-DD" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </FormField>

              <FormField label="Min Playtime (hours)" description="Only include reviews with at least this many hours played">
                <Input value={minPlaytime} onChange={(e) => setMinPlaytime(e.target.value)} />
              </FormField>

              <FormField label="Max Playtime (hours)" description="Only include reviews with no more than this many hours played">
                <Input value={maxPlaytime} onChange={(e) => setMaxPlaytime(e.target.value)} />
              </FormField>

              <FormField label="Early Access" description="Include early access games">
                <Select
                  options={[{ value: "include", label: "Include" }, { value: "exclude", label: "Exclude" }, { value: "only", label: "Only" }]}
                  value={earlyAccess}
                  onChange={(e: any) => setEarlyAccess(e.target.value)}
                />
              </FormField>

              <FormField label="Free Games" description="Include games received for free">
                <Select
                  options={[{ value: "include", label: "Include" }, { value: "exclude", label: "Exclude" }, { value: "only", label: "Only" }]}
                  value={freeGames}
                  onChange={(e: any) => setFreeGames(e.target.value)}
                />
              </FormField>
            </FormGrid>
          </FormSection>

            </CollapsibleContent>
          </Collapsible>

        </div>
      </Card>

      <Card>
        <div className="p-6">
          <h2 className="text-lg font-semibold">Results (preview)</h2>
          <p className="text-sm text-muted-foreground">Graphs, progress and results will appear here once analysis is wired up.</p>

          {previewError && (
            <div className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{previewError}</div>
          )}

          {previewTotal !== null && (
            <div className="mt-4">
              <div className="text-sm text-muted-foreground">Matching reviews: <strong className="text-foreground">{previewTotal}</strong></div>

              <div className="mt-3 space-y-3">
                {previewSamples.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No sample reviews returned.</div>
                ) : (
                  previewSamples.map((s) => (
                    <div key={s.review_id} className="rounded-md border p-3">
                      <div className="text-xs text-muted-foreground">App ID: {s.app_id} • Review ID: {s.review_id}</div>
                      <div className="mt-2 text-sm">{s.review_text.length > 400 ? s.review_text.slice(0, 400) + "…" : s.review_text}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Analysis;


