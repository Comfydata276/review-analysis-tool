import React from "react";
import { cn } from "../../lib/utils";
import { ChevronDownIcon } from "@heroicons/react/24/outline";

interface CollapsibleContextType {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const CollapsibleContext = React.createContext<CollapsibleContextType | undefined>(undefined);

function useCollapsible() {
  const context = React.useContext(CollapsibleContext);
  if (!context) {
    throw new Error("Collapsible components must be used within a Collapsible component");
  }
  return context;
}

interface CollapsibleProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
  className?: string;
}

export function Collapsible({
  open: openProp,
  onOpenChange,
  defaultOpen = false,
  children,
  className,
}: CollapsibleProps) {
  const [_open, _setOpen] = React.useState(defaultOpen);
  
  const open = openProp ?? _open;
  const setOpen = onOpenChange ?? _setOpen;

  const contextValue = React.useMemo(
    () => ({ open, onOpenChange: setOpen }),
    [open, setOpen]
  );

  return (
    <CollapsibleContext.Provider value={contextValue}>
      <div className={cn("", className)}>{children}</div>
    </CollapsibleContext.Provider>
  );
}

interface CollapsibleTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export function CollapsibleTrigger({
  asChild,
  className,
  children,
  ...props
}: CollapsibleTriggerProps) {
  const { open, onOpenChange } = useCollapsible();

  if (asChild) {
    return (
      <div onClick={() => onOpenChange(!open)} className={className}>
        {children}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenChange(!open)}
      className={cn(
        "flex w-full items-center justify-between rounded-md p-2 text-left text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDownIcon
        className={cn(
          "h-4 w-4 transition-transform duration-200",
          open ? "rotate-180" : ""
        )}
      />
    </button>
  );
}

interface CollapsibleContentProps extends React.HTMLAttributes<HTMLDivElement> {}

export function CollapsibleContent({
  className,
  children,
  ...props
}: CollapsibleContentProps) {
  const { open } = useCollapsible();

  return (
    <div
      className={cn(
        "overflow-hidden transition-all duration-200 ease-in-out",
        open ? "animate-in slide-in-from-top-1" : "animate-out slide-out-to-top-1 hidden",
        className
      )}
      {...props}
    >
      {open && children}
    </div>
  );
}
