import React, { useEffect, useState, useRef } from "react";
import { listAnalysisResults } from "../api/analysis";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Button } from "../components/ui/Button";
import toast from "react-hot-toast";

export const AnalysisResults: React.FC = () => {
  const [appId, setAppId] = useState<number | undefined>(undefined);
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [limit, setLimit] = useState<number>(50);
  const [offset, setOffset] = useState<number>(0);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [polling, setPolling] = useState<boolean>(false);
  const pollingRef = useRef<number | null>(null);

  function copyToClipboard(r: any) {
    const text = r.analysed_review || r.analysis_output || r.review_text_snapshot || "";
    try {
      navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
    } catch (e) {
      toast.error("Copy failed");
    }
  }

  function openOriginalReview(r: any) {
    // If we have review_id and app_id, open Steam review URL in new tab
    if (r.review_id && r.app_id) {
      const url = `https://steamcommunity.com/app/${r.app_id}/reviews/`;
      window.open(url, "_blank");
      return;
    }
    toast.error("No original review link available");
  }

  function exportCsv(rows: any[]) {
    if (!rows || rows.length === 0) {
      toast.error("No rows to export");
      return;
    }
    const headers = ["id", "job_id", "app_id", "game_name", "review_id", "status", "analysed_review"];
    const lines = [headers.join(",")];
    for (const r of rows) {
      const analysed = (r.analysed_review || r.analysis_output || r.review_text_snapshot || "").replace(/"/g, '""').replace(/\n/g, " ");
      const vals = [r.id, r.job_id, r.app_id, (r.game_name || "").replace(/\n/g, " "), (r.review_id || ""), (r.status || ""), `"${analysed}"`];
      lines.push(vals.join(","));
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analysis_results_${appId || 'all'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!appId) return setResults([]);
      setLoading(true);
      try {
        const res = await listAnalysisResults(appId, limit, offset);
        // optional client-side filter by status
        const filtered = res && statusFilter ? res.filter((r: any) => r.status === statusFilter) : res;
        if (!cancelled) setResults(filtered || []);
      } catch (e: any) {
        toast.error(e.message || "Failed to load results");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [appId, limit, offset, statusFilter]);

  // polling
  useEffect(() => {
    if (!polling || !appId) return;
    pollingRef.current = window.setInterval(async () => {
      try {
        const res = await listAnalysisResults(appId, limit, offset);
        const filtered = res && statusFilter ? res.filter((r: any) => r.status === statusFilter) : res;
        setResults(filtered || []);
      } catch (e) {
        // ignore polling errors
      }
    }, 3000);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [polling, appId, limit, offset, statusFilter]);

  return (
    <div className="space-y-6 p-0">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold">Analysis Results</h1>
          <p className="text-sm text-muted-foreground">View analyzed reviews stored in the database.</p>
        </div>
      </div>

      <Card>
        <div className="flex gap-3 items-end w-full">
          <div className="w-40">
            <label className="text-sm text-muted-foreground block mb-1">AppID</label>
            <Input value={appId ?? ""} onChange={(e) => { setAppId(e.target.value ? Number(e.target.value) : undefined); setOffset(0); }} placeholder="Enter AppID" />
          </div>

          <div className="w-36">
            <label className="text-sm text-muted-foreground block mb-1">Limit</label>
            <Input type="number" value={limit} onChange={(e) => { setLimit(Number(e.target.value || 50)); setOffset(0); }} />
          </div>

          <div className="w-44">
            <label className="text-sm text-muted-foreground block mb-1">Status</label>
            <Select options={[{label: 'Any', value: ''}, {label: 'completed', value: 'completed'}, {label: 'pending', value: 'pending'}, {label: 'error', value: 'error'}]} value={statusFilter || ''} onChange={(e) => { setStatusFilter(e.target.value || undefined); setOffset(0); }} />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Button onClick={() => { setOffset(0); /* refresh triggered by effect */ }} disabled={loading}>
              {loading ? "Loading..." : "Refresh"}
            </Button>
            <Button variant={polling ? "destructive" : "outline"} onClick={() => setPolling((p) => !p)}>
              {polling ? "Stop Polling" : "Start Polling"}
            </Button>
            <Button onClick={() => exportCsv(results)}>
              Export CSV
            </Button>
          </div>
        </div>
      </Card>

      <div>
        {results.length === 0 ? (
          <Card>
            <div className="p-4 text-sm text-muted-foreground">No results — enter an AppID and press Refresh (or wait).</div>
          </Card>
        ) : (
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {results.map((r) => (
              <Card key={r.id}>
                <div className="p-3">
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-3">
                      <div className="text-sm font-medium">Result #{r.id}</div>
                      <div className="text-xs text-muted-foreground">Status: {r.status}</div>
                      <div className="text-xs text-muted-foreground">Job {r.job_id}</div>
                      <div className="text-xs text-muted-foreground mt-2">App {r.app_id}</div>
                      <div className="mt-3 flex flex-col gap-2">
                        <Button size="sm" onClick={() => copyToClipboard(r)}>
                          Copy
                        </Button>
                        <Button size="sm" onClick={() => openOriginalReview(r)}>
                          View on Steam
                        </Button>
                      </div>
                    </div>
                    <div className="col-span-9">
                      <div className="text-sm font-medium">{r.game_name || ''}</div>
                      <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap">{r.analysed_review || r.analysis_output || r.review_text_snapshot}</div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            <div className="flex justify-center mt-4">
              <Button onClick={() => setOffset((o) => o + limit)} disabled={loading}>Load more</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalysisResults;


