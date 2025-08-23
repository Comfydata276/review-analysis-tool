export interface AnalysisSettings {
  global_settings: {
    max_reviews?: number;
    complete_scraping?: boolean;
    simultaneous_batching?: number;
    language?: string;
    start_date?: string;
    end_date?: string;
    early_access?: "include" | "exclude" | "only";
    received_for_free?: "include" | "exclude" | "only";
    min_playtime?: number;
    max_playtime?: number;
  };
  per_game_overrides?: { [appId: number]: Partial<AnalysisSettings["global_settings"]> };
}

export interface AnalysisPreviewResponse {
  total_reviews: number;
  sample_reviews: Array<{ review_id: string; app_id: number; review_text: string }>;
}

export async function previewAnalysis(settings: AnalysisSettings): Promise<AnalysisPreviewResponse> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/analysis/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function getAnalysisSettings(): Promise<any> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/settings/analysis`);
  if (!resp.ok) return {};
  return resp.json();
}

export async function saveAnalysisSettings(payload: any): Promise<void> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/settings/analysis`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(await resp.text());
}

export async function deleteAnalysisSettings(): Promise<void> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/settings/analysis`, { method: "DELETE" });
  if (!resp.ok) throw new Error(await resp.text());
}

export interface StartAnalysisPayload {
  name?: string;
  app_id?: number;
  providers?: Array<string>;
  model?: string;
  reasoning?: { effort: 'low' | 'medium' | 'high' };
  reviews_per_batch?: number;
  batches_per_request?: number;
  // include any filter fields from preview endpoint as needed
  [k: string]: any;
}

export async function startAnalysis(payload: StartAnalysisPayload): Promise<{ job_id: number }> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/analysis/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function listAnalysisJobs(): Promise<any[]> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/analysis/jobs`);
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function getJobResults(jobId: number): Promise<any[]> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/analysis/jobs/${jobId}/results`);
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

// API key management
export interface ApiKeyCreatePayload {
  provider: string;
  encrypted_key: string; // frontend will send raw key; backend encrypts it
  name?: string;
  notes?: string;
}

export async function createApiKey(payload: ApiKeyCreatePayload): Promise<any> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/settings/api-keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function listApiKeys(): Promise<any[]> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/settings/api-keys`);
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function getApiKey(keyId: number): Promise<any> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/settings/api-keys/${keyId}`);
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function deleteApiKey(keyId: number): Promise<void> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/settings/api-keys/${keyId}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(await resp.text());
}

export async function getLLMConfig(): Promise<any> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/settings/llm-config`);
  if (!resp.ok) throw new Error(await resp.text());
  return resp.json();
}

export async function saveLLMConfig(payload: any): Promise<void> {
  const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
  const resp = await fetch(`${BACKEND_URL}/settings/llm-config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!resp.ok) throw new Error(await resp.text());
}


