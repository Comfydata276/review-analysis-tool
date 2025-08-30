const BASE_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

// Utility function to handle API errors properly
async function handleApiError(response: Response): Promise<never> {
  let errorMessage = "An unknown error occurred";

  try {
    const errorData = await response.json();
    // Extract the detail message from FastAPI error responses
    if (errorData.detail) {
      errorMessage = errorData.detail;
    } else if (typeof errorData === 'string') {
      errorMessage = errorData;
    } else {
      errorMessage = JSON.stringify(errorData);
    }
  } catch {
    // If JSON parsing fails, fall back to text
    try {
      const text = await response.text();
      if (text) {
        errorMessage = text;
      }
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
  }

  throw new Error(errorMessage);
}

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) await handleApiError(resp);
  return (await resp.json()) as T;
}

export async function listPrompts(): Promise<string[]> {
  const resp = await fetch(`${BASE_URL}/prompts/`);
  if (!resp.ok) return [];
  return resp.json();
}

export async function getPrompt(name: string): Promise<string> {
  const resp = await fetch(`${BASE_URL}/prompts/${encodeURIComponent(name)}`, { cache: "no-store" });
  if (!resp.ok) await handleApiError(resp);
  return resp.text();
}

export async function savePrompt(name: string, content: string): Promise<void> {
  const form = new FormData();
  const blob = new Blob([content], { type: "text/plain" });
  form.append("file", blob, name);
  const resp = await fetch(`${BASE_URL}/prompts/${encodeURIComponent(name)}`, { method: "POST", body: form });
  if (!resp.ok) await handleApiError(resp);
}

export async function uploadPrompt(file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file, file.name);
  const resp = await fetch(`${BASE_URL}/prompts/upload`, { method: "POST", body: form });
  if (!resp.ok) await handleApiError(resp);
}

export async function deletePrompt(name: string): Promise<void> {
  const resp = await fetch(`${BASE_URL}/prompts/${encodeURIComponent(name)}`, { method: "DELETE" });
  if (!resp.ok) await handleApiError(resp);
}

export async function getActivePrompt(): Promise<string> {
  const resp = await fetch(`${BASE_URL}/prompts/active`);
  if (!resp.ok) await handleApiError(resp);
  const obj = await resp.json();
  return obj.active;
}

export async function setActivePrompt(name: string): Promise<void> {
  // Use the simpler endpoint that takes the name in the path to avoid
  // content-type / body parsing issues across clients.
  const resp = await fetch(`${BASE_URL}/prompts/active/${encodeURIComponent(name)}`, {
    method: "POST",
  });
  if (!resp.ok) await handleApiError(resp);
}


