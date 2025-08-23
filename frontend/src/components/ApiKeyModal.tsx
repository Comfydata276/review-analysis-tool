import React, { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";

type Props = {
  open: boolean;
  initial?: { id?: number; provider?: string; name?: string } | null;
  onClose: () => void;
  onSave: (id: number | null, rawKey: string | undefined, name: string | undefined) => Promise<void>;
};

export const ApiKeyModal: React.FC<Props> = ({ open, initial, onClose, onSave }) => {
  const [name, setName] = useState(initial?.name || "");
  const [rawKey, setRawKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  function validate(provider?: string, key?: string) {
    if (!key) return null;
    // Only validate when creating a new key (not editing existing)
    if (!initial) {
      if (provider === 'openai') {
        if (!(key.startsWith('sk-') || key.startsWith('oai-') || key.length > 30)) return 'Unrecognized OpenAI key format';
      }
      if (key.length < 20) return 'Key looks too short';
    }
    return null;
  }

  useEffect(() => {
    setName(initial?.name || "");
    setRawKey("");
  }, [initial, open]);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => !v && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 transform rounded-lg bg-card p-6 shadow-lg ring-1 ring-border text-foreground">
          <Dialog.Title className="text-base font-semibold">{initial ? 'Edit API Key' : 'Add API Key'}</Dialog.Title>

          <div className="mt-4 space-y-3">
            <Input value={name} placeholder="Key name" onChange={(e) => setName(e.target.value)} />
            {!initial && (
              <Input value={rawKey} placeholder={'Enter API key'} onChange={(e) => { setRawKey(e.target.value); setError(null); }} />
            )}
            {error && <div className="text-sm text-destructive mt-1">{error}</div>}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={async () => {
              const v = validate(initial?.provider, rawKey || undefined);
              if (v) { setError(v); return; }
              // If editing existing key, do not send rawKey (no rotation)
              await onSave(initial?.id ?? null, initial ? undefined : (rawKey || undefined), name || undefined);
              onClose();
            }}>{initial ? 'Update' : 'Add'}</Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ApiKeyModal;


