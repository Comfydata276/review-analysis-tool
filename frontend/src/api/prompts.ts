const BASE_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) throw new Error(await resp.text());
  return (await resp.json()) as T;
}

export async function listPrompts(): Promise<string[]> {
  const resp = await fetch(`${BASE_URL}/prompts/`);
  if (!resp.ok) return [];
  return resp.json();
}

export async function getPrompt(name: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/prompts/${encodeURIComponent(name)}`, { cache: "no-store" });
  if (!resp.ok) throw new Error(await resp.text());
  return resp.text();
}

export async function savePrompt(name: string, content: string): Promise<void> {
  const form = new FormData();
  const blob = new Blob([content], { type: "text/plain" });
  form.append("file", blob, name);
  const resp = await fetch(`${BASE_URL}/prompts/${encodeURIComponent(name)}`, { method: "POST", body: form });
  if (!resp.ok) throw new Error(await resp.text());
}

export async function uploadPrompt(file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file, file.name);
  const resp = await fetch(`${BASE_URL}/prompts/upload`, { method: "POST", body: form });
  if (!resp.ok) throw new Error(await resp.text());
}

export async function deletePrompt(name: string): Promise<void> {
  const resp = await fetch(`${BASE_URL}/prompts/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!resp.ok) throw new Error(await resp.text());
}

export async function getActivePrompt(): Promise<string> {
  const resp = await fetch(`${BASE_URL}/prompts/active`);
  if (!resp.ok) throw new Error(await resp.text());
  const obj = await resp.json();
  return obj.active;
}

export async function setActivePrompt(name: string): Promise<void> {
  // Use the simpler endpoint that takes the name in the path to avoid
  // content-type / body parsing issues across clients.
  const resp = await fetch(`${BASE_URL}/prompts/active/${encodeURIComponent(name)}`, {
    method: "POST",
  });
  if (!resp.ok) throw new Error(await resp.text());
}


