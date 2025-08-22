import React, { createContext, useContext, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "../components/ui/Button";
import { useNavigate, useLocation } from "react-router-dom";

type SaveHandler = () => Promise<void> | void;
type ResetHandler = () => void;

type ContextType = {
  isDirty: boolean;
  setDirty: (d: boolean) => void;
  registerSaveHandler: (h: SaveHandler | null) => void;
  registerResetHandler: (h: ResetHandler | null) => void;
  requestNavigation: (path: string) => void;
};

const UnsavedChangesContext = createContext<ContextType | null>(null);

export const useUnsavedChanges = (): ContextType => {
  const ctx = useContext(UnsavedChangesContext);
  if (!ctx) throw new Error("useUnsavedChanges must be used within UnsavedChangesProvider");
  return ctx;
};

export const UnsavedChangesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDirty, setIsDirty] = useState(false);
  const saveHandlerRef = useRef<SaveHandler | null>(null);
  const resetHandlerRef = useRef<ResetHandler | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const pendingPathRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const setDirty = (d: boolean) => setIsDirty(d);

  const registerSaveHandler = (h: SaveHandler | null) => {
    saveHandlerRef.current = h;
  };

  const registerResetHandler = (h: ResetHandler | null) => {
    resetHandlerRef.current = h;
  };

  const doNavigate = (path: string) => {
    // perform actual navigation
    navigate(path);
  };

  const requestNavigation = (path: string) => {
    // If navigation is to the same location, just navigate
    if (path === location.pathname) return;
    if (!isDirty) {
      doNavigate(path);
      return;
    }
    pendingPathRef.current = path;
    setModalOpen(true);
  };

  const handleSaveThenNavigate = async () => {
    try {
      if (saveHandlerRef.current) await saveHandlerRef.current();
    } catch (e) {
      // swallow; caller should show errors
    }
    setIsDirty(false);
    setModalOpen(false);
    if (pendingPathRef.current) {
      doNavigate(pendingPathRef.current);
      pendingPathRef.current = null;
    }
  };

  const handleDiscardAndNavigate = () => {
    if (resetHandlerRef.current) resetHandlerRef.current();
    setIsDirty(false);
    setModalOpen(false);
    if (pendingPathRef.current) {
      doNavigate(pendingPathRef.current);
      pendingPathRef.current = null;
    }
  };

  const handleReview = () => {
    setModalOpen(false);
    pendingPathRef.current = null;
    // take the user back to the prompts page for review
    if (location.pathname !== "/prompts") navigate("/prompts");
  };

  return (
    <UnsavedChangesContext.Provider
      value={{ isDirty, setDirty, registerSaveHandler, registerResetHandler, requestNavigation }}
    >
      {children}

      <Dialog.Root open={modalOpen} onOpenChange={(open) => !open && setModalOpen(false)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 transform rounded-lg bg-card p-6 shadow-lg ring-1 ring-border text-foreground">
            <Dialog.Title className="text-base font-semibold text-foreground">You have unsaved changes</Dialog.Title>
            <Dialog.Description className="mt-2 text-sm text-foreground/80">You have unsaved changes to your prompt. What would you like to do?</Dialog.Description>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={handleReview} className="px-3 py-1">Review Changes</Button>
              <Button variant="default" onClick={handleSaveThenNavigate} className="px-3 py-1">Save</Button>
              <Button variant="destructive" onClick={handleDiscardAndNavigate} className="px-3 py-1">Discard</Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </UnsavedChangesContext.Provider>
  );
};

export default UnsavedChangesProvider;


