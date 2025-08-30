import React, { useState } from "react";
import { notifications } from "../utils/notifications";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { Badge } from "../components/ui/Badge";
import { TrashIcon, PencilSquareIcon } from "@heroicons/react/24/outline";
import { ModelModal } from "./ModelModal";

const TAGS = ["Reasoning", "General", "Lite", "Fast", "Local"];

type ModelDef = {
  display: string;
  api_name: string;
  enabled?: boolean;
  tags?: string[];
  reasoning_default?: "low" | "medium" | "high";
};

type Props = {
  provider: string;
  keys: any[];
  config: any;
  onChange: (next: any) => Promise<void>;
  keysLoading?: boolean;
};

export const ProviderCard: React.FC<Props> = ({ provider, keys, config, onChange, keysLoading }) => {
  const providerKey = String(provider || "").toLowerCase();
  // Normalize provider lookup to be case-insensitive: check both original and lower-cased keys
  const pconf = (config.providers && (config.providers[provider] || config.providers[providerKey] || config.providers[String(provider).toLowerCase()])) || { enabled: false, api_key_id: null, models: {} };
  const models: ModelDef[] = Object.keys(pconf.models || {}).map((k) => ({ api_name: k, ...(pconf.models[k] as any) }));
  const [openModal, setOpenModal] = useState(false);
  const [editing, setEditing] = useState<ModelDef | null>(null);


  // Match keys by provider case-insensitively
  const firstKeyForProvider = keys.find((k) => String(k.provider || "").toLowerCase() === providerKey) || null;

  async function toggleProvider() {
    const next = { ...(config || {}) };
    next.providers = next.providers || {};
    next.providers[providerKey] = next.providers[providerKey] || { models: {} };

    // Prevent enabling provider if no API key is selected
    const currentlyEnabled = Boolean(next.providers[providerKey].enabled);
    const hasApiKey = Boolean(next.providers[providerKey].api_key_id) || Boolean(firstKeyForProvider);

    if (!currentlyEnabled && !hasApiKey) {
      // Show error toast
      notifications.error("Please select an API key before enabling this provider.");
      return;
    }

    try {
      next.providers[providerKey].enabled = !currentlyEnabled;
      if (!next.providers[providerKey].api_key_id && firstKeyForProvider) next.providers[providerKey].api_key_id = firstKeyForProvider.id;
      await onChange(next);
    } catch (e: any) {
      // Handle any errors from the onChange call
      notifications.error(e.message || "Unable to update provider settings. Please try again.");
    }
  }

  async function selectKey(id: number) {
    const next = { ...(config || {}) };
    next.providers = next.providers || {};
    next.providers[providerKey] = next.providers[providerKey] || { models: {} };
    next.providers[providerKey].api_key_id = id;
    // If user unselects the key (id === null) then disable the provider
    if (id === null) {
      next.providers[providerKey].enabled = false;
    }

    try {
      await onChange(next);
      notifications.success("API key set active");
    } catch (e: any) {
      notifications.error("Unable to set API key. Please try again.");
    }
  }

  async function saveModel(md: ModelDef, isNew: boolean) {
    const next = { ...(config || {}) };
    next.providers = next.providers || {};
    next.providers[providerKey] = next.providers[providerKey] || { models: {} };
    next.providers[providerKey].models = next.providers[providerKey].models || {};
    next.providers[providerKey].models[md.api_name] = { display: md.display, enabled: md.enabled !== false, tags: md.tags || [], reasoning_default: md.reasoning_default || "medium" };
    await onChange(next);
    setOpenModal(false);
  }

  async function deleteModel(api_name: string) {
    const next = { ...(config || {}) };
    if (next.providers && (next.providers[provider] || next.providers[providerKey]) && (next.providers[provider] || next.providers[providerKey]).models) {
      const target = next.providers[provider] || next.providers[providerKey];
      delete target.models[api_name];
      await onChange(next);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-muted rounded p-2">
            <svg className="h-6 w-6 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7h18M3 12h18M3 17h18"/></svg>
          </div>
          <div>
            <div className="font-semibold">{provider}</div>
            <div className="text-xs text-muted-foreground">{models.length} models available</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Select
            options={[
              { label: "No key selected", value: "" },
              ...keys
                .filter((k) => String(k.provider || "").toLowerCase() === providerKey)
                .map((k) => ({ label: k.name || `(key ${k.id})`, value: String(k.id) })),
            ]}
            value={pconf.api_key_id ? String(pconf.api_key_id) : ""}
            disabled={!!keysLoading}
            onChange={(e) => {
              const v = e.target.value;
              const id = v === "" ? null : parseInt(v, 10);
              selectKey(id as any);
            }}
          />
              {keysLoading && (
                <div className="absolute right-2 top-2">
                  <svg className="h-4 w-4 animate-spin text-muted-foreground" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 01-8 8z" />
                  </svg>
                </div>
              )}
            </div>
          </div>
          <Button size="sm" variant={pconf.enabled ? 'secondary' : 'outline'} onClick={toggleProvider} disabled={!!keysLoading}>{pconf.enabled ? "Enabled" : "Disabled"}</Button>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Available Models</div>
          <Button size="sm" onClick={() => { setEditing(null); setOpenModal(true); }}>+ Add Model</Button>
        </div>

        <div className="mt-3 space-y-2">
          {models.map((m) => (
            <div key={m.api_name} className="flex items-center justify-between border p-3 rounded">
              <div className="flex items-center gap-3">
                <div>
                  <div className="font-medium">{m.display}</div>
                  <div className="text-xs text-muted-foreground">API: {m.api_name}</div>
                </div>
                <div className="flex gap-2">
                  {(m.tags || []).map(t => <Badge key={t} variant="outline" size="sm">{t}</Badge>)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select value={m.enabled ? "enabled" : "disabled"} onChange={async (e) => saveModel({ ...m, enabled: e.target.value === "enabled" }, false)} options={[{ label: "Enabled", value: "enabled" }, { label: "Disabled", value: "disabled" }]} />
                <button onClick={() => { setEditing(m); setOpenModal(true); }} className="p-2 rounded hover:bg-muted"><PencilSquareIcon className="h-4 w-4"/></button>
                <button onClick={() => {
                  // delegate to top-level confirm modal via custom event
                  const ev = new CustomEvent('llm:confirm-delete-model', { detail: { provider: providerKey, api_name: m.api_name } });
                  window.dispatchEvent(ev as any);
                }} className="p-2 rounded hover:bg-muted"><TrashIcon className="h-4 w-4"/></button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <ModelModal open={openModal} initial={editing} onClose={() => setOpenModal(false)} onSave={saveModel} tags={TAGS} />
    </Card>
  );
};

export default ProviderCard;


