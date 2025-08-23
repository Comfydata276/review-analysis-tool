import React, { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";

type ModelDef = {
  display?: string;
  api_name?: string;
  enabled?: boolean;
  tags?: string[];
  reasoning_default?: "low" | "medium" | "high";
};

export const ModelModal: React.FC<{ open: boolean; initial?: ModelDef | null; onClose: () => void; onSave: (m: ModelDef, isNew: boolean) => void; tags: string[] }> = ({ open, initial, onClose, onSave, tags }) => {
  const [display, setDisplay] = useState("");
  const [apiName, setApiName] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [reasoning, setReasoning] = useState<"low" | "medium" | "high">("medium");

  useEffect(() => {
    if (initial) {
      setDisplay(initial.display || "");
      setApiName(initial.api_name || "");
      setSelectedTags(initial.tags || []);
      setReasoning(initial.reasoning_default || "medium");
    } else {
      setDisplay("");
      setApiName("");
      setSelectedTags([]);
      setReasoning("medium");
    }
  }, [initial, open]);

  function toggleTag(t: string) {
    if (selectedTags.includes(t)) setSelectedTags((s) => s.filter((x) => x !== t));
    else setSelectedTags((s) => [...s, t]);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 transform rounded-lg bg-card p-6 shadow-lg ring-1 ring-border text-foreground">
          <Dialog.Title className="text-base font-semibold">{initial ? `Edit Model - ${initial.api_name}` : `Add New Model`}</Dialog.Title>

          <div className="mt-4 space-y-3">
            <Input value={display} placeholder="Display name (e.g., GPT-5)" onChange={(e) => setDisplay(e.target.value)} />
            <Input value={apiName} placeholder="API name (e.g., gpt-5)" onChange={(e) => setApiName(e.target.value)} />

            <div>
              <div className="text-sm text-muted-foreground mb-2">Tags</div>
              <div className="flex gap-2 flex-wrap">
                {tags.map((t) => (
                  <button key={t} onClick={() => toggleTag(t)} className={`px-2 py-1 rounded ${selectedTags.includes(t) ? 'bg-primary text-white' : 'bg-muted text-foreground'}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {selectedTags.includes('Reasoning') && (
              <div>
                <div className="text-sm text-muted-foreground mb-2">Reasoning Level</div>
                <Select value={reasoning} onChange={(e) => setReasoning(e.target.value as any)} options={[{ label: 'Low', value: 'low' }, { label: 'Medium', value: 'medium' }, { label: 'High', value: 'high' }]} />
              </div>
            )}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave({ display, api_name: apiName, tags: selectedTags, reasoning_default: reasoning, enabled: true }, !initial)}>{initial ? 'Update Model' : 'Add Model'}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ModelModal;


