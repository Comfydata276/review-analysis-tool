import React, { useEffect, useState } from "react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { FormField, FormSection } from "../components/ui/FormField";
import { createApiKey, listApiKeys, deleteApiKey } from "../api/analysis";
import { getLLMConfig, saveLLMConfig } from "../api/analysis";
import { notifications } from "../utils/notifications";
import ProviderCard from "../components/ProviderCard";
import { ConfirmModal } from "../components/ConfirmModal";
import ApiKeyModal from "../components/ApiKeyModal";
import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

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

export const LLMConfig: React.FC = () => {
  const [keys, setKeys] = useState<any[]>([]);
  const [keysLoading, setKeysLoading] = useState(false);
  const [provider, setProvider] = useState("openai");
  const [name, setName] = useState("");
  const [keyRaw, setKeyRaw] = useState("");
  const [llmConfig, setLlmConfig] = useState<any>({});
  const [showKey, setShowKey] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  const [confirmTitle, setConfirmTitle] = useState<string>("Confirm action");
  const [confirmDescription, setConfirmDescription] = useState<string>("Are you sure?");
  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<any | null>(null);


  async function load() {
    setKeysLoading(true);
    try {
      const k = await listApiKeys();
      setKeys(k || []);
      try {
        const cfg = await getLLMConfig();
        setLlmConfig(cfg || {});
      } catch (e) {
        setLlmConfig({});
      }
    } catch (e: any) {
      notifications.error("Unable to load API keys. Please check your connection and try again.");
    } finally {
      setKeysLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    function onConfirmDelete(e: any) {
      const { provider, api_name } = e.detail || {};
      if (!api_name) return;
      setConfirmTitle("Delete model");
      setConfirmDescription(`Are you sure you want to delete the model '${api_name}' from provider '${provider}'? This action cannot be undone.`);
      setConfirmAction(() => async () => {
        // delete model by delegating to saveLLMConfig
        const next = { ...(llmConfig || {}) };
        if (next.providers && next.providers[provider] && next.providers[provider].models) {
          delete next.providers[provider].models[api_name];
          await saveLLMConfig(next);
          setLlmConfig(next);
          notifications.success('Model deleted');
        }
      });
      setConfirmOpen(true);
    }
    window.addEventListener('llm:confirm-delete-model', onConfirmDelete as any);
    return () => window.removeEventListener('llm:confirm-delete-model', onConfirmDelete as any);
  }, [llmConfig]);

  async function handleAdd() {
    try {
      await createApiKey({ provider, encrypted_key: keyRaw, name });
      setKeyRaw("");
      setName("");
      notifications.success("API key saved");
      load();
    } catch (e: any) {
      notifications.error(e.message || "Unable to save API key. Please verify the key format and try again.");
    }
  }

  async function handleEditKey(id: number, nextRawKey?: string, nextName?: string) {
    try {
      const payload: any = {};
      if (nextRawKey) payload.encrypted_key = nextRawKey;
      if (nextName !== undefined) payload.name = nextName;
      const BACKEND_URL = (import.meta as any).env.VITE_BACKEND_URL || "http://127.0.0.1:8000";
      const resp = await fetch(`${BACKEND_URL}/settings/api-keys/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!resp.ok) await handleApiError(resp);
      notifications.success('Key updated');
      load();
    } catch (e: any) {
      notifications.error(e.message || 'Unable to update API key. Please verify the key format and try again.');
    }
  }

  async function handleDelete(id: number) {
    setConfirmTitle("Delete API key");
    setConfirmDescription("Are you sure you want to delete this API key? This action cannot be undone.");
    setConfirmAction(() => async () => {
      try {
        await deleteApiKey(id);
        notifications.success("Deleted");
        // After deleting a key, reload keys and ensure any providers using this key are disabled
        await load();
        try {
          const cfg = await getLLMConfig();
          if (cfg && cfg.providers) {
            let changed = false;
            Object.keys(cfg.providers).forEach((p) => {
              if (cfg.providers[p].api_key_id === id) {
                cfg.providers[p].api_key_id = null;
                cfg.providers[p].enabled = false;
                changed = true;
              }
            });
            if (changed) {
              await saveLLMConfig(cfg);
              setLlmConfig(cfg);
            }
          }
        } catch (e) {
          // ignore
        }
      } catch (e: any) {
        notifications.error("Unable to delete API key. Please try again.");
      }
    });
    setConfirmOpen(true);
  }

  return (
    <>
    <div className="space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">LLM Config</h1>
          <p className="text-sm text-muted-foreground">Manage providers, models and API keys</p>
        </div>
      </div>

      <Card>
        <FormSection title="API Keys" description="Add provider API keys (stored encrypted)">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Provider">
              <Select options={[{label: 'OpenAI', value: 'openai'}, {label: 'Google', value: 'google'}, {label: 'Anthropic', value: 'anthropic'}, {label: 'OpenRouter', value: 'openrouter'}]} value={provider} onChange={(e) => setProvider(e.target.value)} />
              <div className="text-xs text-muted-foreground mt-1">
                {provider === 'openai' && 'Supported formats: OpenAI keys start with `sk-` or `oai-`.'}
                {provider === 'openrouter' && 'Supported formats: OpenRouter keys start with `sk-or-`.'}
                {provider === 'anthropic' && 'Supported formats: Anthropic keys start with `sk-ant-`.'}
                {provider === 'google' && 'Supported formats: Google API keys start with `AIza`.'}
              </div>
            </FormField>
            <FormField label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></FormField>
            <FormField label="Key">
              <div className="relative">
                <Input value={showKey ? keyRaw : keyRaw.replace(/.(?=.{6})/g, "*") } onChange={(e) => setKeyRaw(e.target.value)} />
                <button className="absolute right-2 top-2" onClick={(e) => { e.preventDefault(); setShowKey(!showKey); }}>
                  {showKey ? <EyeSlashIcon className="h-5 w-5"/> : <EyeIcon className="h-5 w-5"/> }
                </button>
              </div>
            </FormField>
          </div>
          <div className="mt-4">
            <Button onClick={handleAdd}>Add API Key</Button>
          </div>
        </FormSection>
      </Card>

      <Card>
        <FormSection title="Saved Keys" description="Manage saved provider keys">
          <div className="space-y-2">
            {keys.map((k) => (
              <div key={k.id} className="flex items-center justify-between border p-2 rounded">
                <div>
                  <div className="font-medium">{k.provider} — {k.name || "(unnamed)"}</div>
                  <div className="text-xs text-muted-foreground">{k.masked_key || "(masked)"} — {new Date(k.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => { setEditingKey(k); setApiKeyModalOpen(true); }}>Edit</Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(k.id)}>Delete</Button>
                </div>
              </div>
            ))}
          </div>
        </FormSection>
        <FormSection title="Providers & Models" description="Enable/disable models per provider">
          <div className="space-y-4">
            <ProviderCard provider="OpenAI" keys={keys} keysLoading={keysLoading} config={llmConfig} onChange={async (next) => { setLlmConfig(next); await saveLLMConfig(next); }} />
            <ProviderCard provider="Google" keys={keys} keysLoading={keysLoading} config={llmConfig} onChange={async (next) => { setLlmConfig(next); await saveLLMConfig(next); }} />
            <ProviderCard provider="Anthropic" keys={keys} keysLoading={keysLoading} config={llmConfig} onChange={async (next) => { setLlmConfig(next); await saveLLMConfig(next); }} />
            <ProviderCard provider="OpenRouter" keys={keys} keysLoading={keysLoading} config={llmConfig} onChange={async (next) => { setLlmConfig(next); await saveLLMConfig(next); }} />
          </div>
        </FormSection>
      </Card>
    </div>
      <ConfirmModal open={confirmOpen} title={confirmTitle} description={confirmDescription} confirmLabel="Yes" cancelLabel="No" onClose={() => setConfirmOpen(false)} onConfirm={async () => { if (confirmAction) await confirmAction(); setConfirmOpen(false); }} />
      <ApiKeyModal open={apiKeyModalOpen} initial={editingKey ? { id: editingKey.id, provider: editingKey.provider, name: editingKey.name } : null} onClose={() => { setApiKeyModalOpen(false); setEditingKey(null); }} onSave={async (id, rawKey, newName) => { if (id) await handleEditKey(id, rawKey, newName); else if (rawKey) { await createApiKey({ provider, encrypted_key: rawKey, name: newName || '' }); load(); } }} />
    </>
  );
};

export default LLMConfig;


