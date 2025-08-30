import React, { useEffect, useRef, useState } from "react";
import { Card } from "../components/ui/Card";
import { FormField } from "../components/ui/FormField";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { notifications } from "../utils/notifications";
import { ConfirmModal } from "../components/ConfirmModal";
import { listPrompts, getPrompt, savePrompt, uploadPrompt, deletePrompt, getActivePrompt, setActivePrompt } from "../api/prompts";
import Editor from "@monaco-editor/react";
import { useTheme } from "../context/ThemeProvider";
import { useUnsavedChanges } from "../context/UnsavedChangesContext";

// Icons
const TrashIcon: React.FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const FileIcon: React.FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const UploadIcon: React.FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
  </svg>
);

const PlusIcon: React.FC<{ className?: string }> = ({ className = "h-4 w-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
  </svg>
);

export const Prompt: React.FC = () => {
  const [files, setFiles] = useState<{ label: string; value: string }[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [activePrompt, setActivePromptState] = useState<string>("prompt.txt");
  const [content, setContent] = useState<string>("# Edit prompt here\n");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [creating, setCreating] = useState(false);
  const [newFilename, setNewFilename] = useState("");
  const [filenameError, setFilenameError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [toDelete, setToDelete] = useState<string | null>(null);
  const { theme } = useTheme();
  const { setDirty, registerSaveHandler, registerResetHandler } = useUnsavedChanges();
  const originalContentRef = useRef<string>("");

  useEffect(() => {
    let cancelled = false;
    async function loadList() {
      try {
        const names = await listPrompts();
        if (cancelled) return;
        const opts = names.map((n) => ({ label: n, value: n }));
        setFiles(opts);
        // pick default selection: active prompt if present, else first
        try {
          const active = await getActivePrompt();
          if (!cancelled) setActivePromptState(active);
          if (opts.length > 0 && !selected) {
            // if active exists in opts, select it; otherwise select first
            const hasActive = opts.find((o) => o.value === active);
            setSelected(hasActive ? active : opts[0].value);
          }
        } catch (e) {
          if (opts.length > 0 && !selected) setSelected(opts[0].value);
        }
      } catch (e: any) {
        console.error("Failed to list prompts", e);
      }
    }
    loadList();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    (async () => {
      try {
        const txt = await getPrompt(selected);
        if (!cancelled) {
          setContent(txt);
          originalContentRef.current = txt;
          setDirty(false);
        }
      } catch (e: any) {
        notifications.error(`Unable to load prompt "${selected}". Please check your connection and try again.`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  // Ctrl/Cmd+S handler
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSave();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, content]);

  async function handleSave() {
    if (!selected) return notifications.error("Please select a prompt to save.");
    try {
      await savePrompt(selected, content);
      notifications.success("Saved");
      originalContentRef.current = content;
      setDirty(false);
    } catch (e: any) {
      notifications.error("Unable to save prompt. Please check your connection and try again.");
    }
  }

  async function handleUploadFile(f: File) {
    try {
      await uploadPrompt(f);
      notifications.success("Uploaded");
      const names = await listPrompts();
      setFiles(names.map((n) => ({ label: n, value: n })));
      setSelected(f.name);
    } catch (e: any) {
      notifications.error("Unable to upload prompt file. Please check the file format and try again.");
    }
  }

  async function handleCreateNew() {
    const raw = (newFilename || "").trim();
    if (!raw) return notifications.error("Please enter a filename for the new prompt.");

    // Validate against allowed characters (letters, numbers, dash, underscore)
    if (!/^[A-Za-z0-9-_]+$/.test(raw)) {
      return notifications.error("Filename contains invalid characters. Please use only letters, numbers, hyphens (-), and underscores (_).");
    }

    if (raw.length > 200) return notifications.error("Filename is too long. Please use a shorter name (maximum 200 characters).");

    const filename = `${raw}.txt`;

    const exists = files.find((f) => f.value === filename);
    if (exists) {
      const ok = window.confirm("File exists. Overwrite?");
      if (!ok) return;
    }

    try {
      await savePrompt(filename, "");
      const names = await listPrompts();
      setFiles(names.map((n) => ({ label: n, value: n })));
      setSelected(filename);
      setCreating(false);
      setNewFilename("");
      notifications.success("Created");
    } catch (e: any) {
      notifications.error("Unable to create new prompt. Please try again.");
    }
  }

  async function handleDelete(filename: string, e: React.MouseEvent) {
    e.stopPropagation();
    console.log("Prompt: handleDelete clicked", filename);
    
    if (filename === "prompt.txt") {
      return notifications.error("The default prompt cannot be deleted as it is required by the system.");
    }

    // open confirmation modal instead of native confirm
    setToDelete(filename);
    setConfirmOpen(true);
  }

  async function handleConfirmDelete() {
    if (!toDelete) return;
    const filename = toDelete;
    setConfirmOpen(false);
    setToDelete(null);
    try {
      await deletePrompt(filename);
      notifications.success(`Deleted ${filename}`);

      const names = await listPrompts();
      setFiles(names.map((n) => ({ label: n, value: n })));

      // If the deleted file was the active prompt, revert to default and notify
      if (activePrompt === filename) {
        try {
          await setActivePrompt("prompt.txt");
          setActivePromptState("prompt.txt");
          notifications.success("Set active prompt: prompt.txt");
        } catch (err: any) {
          console.error("Failed to set default active prompt:", err);
        }
      }

      if (selected === filename) {
        const remaining = names.filter(n => n !== filename);
        setSelected(remaining.length > 0 ? remaining[0] : "");
      }
    } catch (e: any) {
      notifications.error(`Unable to delete "${filename}". Please try again.`);
    }
  }

  // Track dirty state when content changes compared to original
  useEffect(() => {
    setDirty(content !== originalContentRef.current);
  }, [content, setDirty]);

  // Register save/reset handlers so the UnsavedChangesProvider can invoke them
  useEffect(() => {
    registerSaveHandler(async () => {
      if (!selected) return;
      await savePrompt(selected, content);
      originalContentRef.current = content;
      setDirty(false);
    });
    registerResetHandler(() => {
      setContent(originalContentRef.current);
      setDirty(false);
    });
    return () => {
      registerSaveHandler(null);
      registerResetHandler(null);
    };
  }, [selected, content, registerSaveHandler, registerResetHandler, setDirty]);

  return (
    <div className="h-screen flex flex-col" data-testid="prompt-page">
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between p-6 border-b border-border">
        <div>
          <h1 className="text-3xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-sky-600 to-indigo-600">
            Prompts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Edit, upload and manage LLM prompts used by the app.
          </p>
        </div>
        <Button variant="gradient" onClick={handleSave}>
          Save
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex min-h-0">
        {/* Sidebar */}
        <div className="w-80 flex-shrink-0 border-r border-border bg-muted/30 flex flex-col">
          {/* Sidebar Header */}
          <div className="p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <FileIcon className="h-5 w-5 text-muted-foreground" />
              <h3 className="font-semibold text-sm">Prompt Files</h3>
            </div>
          </div>

          {/* Action Buttons - Moved here */}
          <div className="p-4 border-b border-border">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 h-8"
              >
                <UploadIcon className="h-3 w-3 mr-1" />
                Upload
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setCreating(true); setNewFilename(""); setFilenameError(null); }}
                className="flex-1 h-8"
              >
                <PlusIcon className="h-3 w-3 mr-1" />
                New
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  const isTxt = /\.txt$/i.test(f.name) || f.type === "text/plain";
                  if (!isTxt) {
                    notifications.error("Only .txt files are allowed. Please select a text file to upload.");
                  } else {
                    handleUploadFile(f);
                  }
                }
                if (e.target) e.target.value = "";
              }}
            />
          </div>

          {/* New File Form */}
          {creating && (
            <div className="p-4 bg-background border-b border-border">
              <div className="space-y-3">
                <div className="relative">
                  <Input
                    value={newFilename}
                    onChange={(e) => {
                      const raw = e.target.value;
                      // Allow only letters, numbers, dash, underscore
                      const cleaned = raw.replace(/[^A-Za-z0-9-_]/g, "");
                      if (cleaned !== raw) {
                        setFilenameError("Invalid characters removed. Only letters, numbers, hyphens (-), and underscores (_) are allowed.");
                      } else {
                        setFilenameError(null);
                      }
                      setNewFilename(cleaned);
                    }}
                    placeholder="Enter filename..."
                    className="h-8 pr-12"
                    autoFocus
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground select-none">
                    .txt
                  </div>
                </div>
                {filenameError && <p className="text-xs text-destructive mt-1">{filenameError}</p>}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setCreating(false); setNewFilename(""); setFilenameError(null); }}
                    className="flex-1 h-7"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleCreateNew}
                    className="flex-1 h-7"
                  >
                    Create
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* File List */}
          <div className="flex-1 overflow-y-auto">
            {files.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                <FileIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No prompt files found</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setCreating(true); setNewFilename(""); setFilenameError(null); }}
                  className="mt-2 h-7"
                >
                  Create your first prompt
                </Button>
              </div>
            ) : (
              <div className="p-2">
                {files.map((file) => (
                  <div
                    key={file.value}
                    className={`group relative flex items-center gap-3 p-3 rounded-lg mb-1 cursor-pointer transition-all hover:bg-background/60 ${
                      selected === file.value
                        ? 'bg-primary/10 border border-primary/20 text-primary'
                        : 'hover:bg-background/80'
                    }`}
                    onClick={() => setSelected(file.value)}
                  >
                    <FileIcon className="h-4 w-4 flex-shrink-0 opacity-60" />
                    <span className="flex-1 text-sm font-medium truncate">
                      {file.label}
                    </span>
                    <div className="flex items-center gap-2">
                      {file.value !== "prompt.txt" && (
                        <button
                          onClick={(e) => handleDelete(file.value, e)}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 hover:text-destructive transition-all"
                          title={`Delete ${file.label}`}
                        >
                          <TrashIcon className="h-3 w-3" />
                        </button>
                      )}

                      <Button size="sm" variant={activePrompt === file.value ? "gradient" : "outline"} className="ml-2 h-7" onClick={(e) => { e.stopPropagation(); (async () => { try { await setActivePrompt(file.value); setActivePromptState(file.value); notifications.success(`Set active prompt: ${file.value}`); } catch (err: any) { notifications.error(err.message || String(err)); } })(); }}>
                        {activePrompt === file.value ? 'Active' : 'Set active'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold text-sm text-muted-foreground">
              {selected ? `Editing: ${selected}` : 'Select a prompt file to edit'}
            </h3>
          </div>
          
          <div className="flex-1 p-4">
            <div className="h-full border border-input rounded-lg overflow-hidden bg-background">
              <Editor
                height="100%"
                defaultLanguage="markdown"
                theme={theme === "dark" ? "vs-dark" : "vs"}
                value={content}
                onChange={(v) => setContent(v || "")}
                options={{
                  minimap: { enabled: false },
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, "Roboto Mono", "Segoe UI Mono", monospace',
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  wordWrap: 'on',
                  wrappingIndent: 'same',
                  scrollbar: {
                    vertical: 'auto',
                    horizontal: 'auto',
                    alwaysConsumeMouseWheel: false
                  },
                }}
              />
            </div>
          </div>
        </div>
        <ConfirmModal
          open={confirmOpen}
          title={toDelete ? `Delete "${toDelete}"?` : "Delete prompt?"}
          description={toDelete ? `Are you sure you want to permanently delete "${toDelete}"? This cannot be undone.` : undefined}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleConfirmDelete}
          onClose={() => { setConfirmOpen(false); setToDelete(null); }}
        />
      </div>
    </div>
  );
};

export default Prompt;