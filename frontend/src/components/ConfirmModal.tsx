import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Button } from "./ui/Button";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
};

export const ConfirmModal: React.FC<Props> = ({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onClose,
}) => {
  return (
    <Dialog.Root open={open} onOpenChange={(val) => !val && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-md -translate-x-1/2 -translate-y-1/2 transform rounded-lg bg-card p-6 shadow-lg ring-1 ring-border text-foreground">
          <Dialog.Title className="text-base font-semibold text-foreground">{title}</Dialog.Title>
          {description && <Dialog.Description className="mt-2 text-sm text-foreground/80">{description}</Dialog.Description>}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="px-3 py-1">{cancelLabel}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                onConfirm();
                onClose();
              }}
              className="px-3 py-1"
            >
              {confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};