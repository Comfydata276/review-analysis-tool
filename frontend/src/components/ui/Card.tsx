import React from "react";

type Props = {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export function Card({ title, subtitle, actions, className, children }: Props) {
  return (
    <div
      className={`rounded-[var(--radius)] border border-border bg-card text-card-foreground shadow-sm transition-colors ${className || ""}`}
    >
      {(title || actions || subtitle) && (
        // align header paddings with sidebar header for pixel-perfect alignment
        <div className="flex items-center justify-between gap-2 border-b border-border px-6 py-3">
          <div className="min-w-0">
            {title && (
              <h3 className="truncate text-sm font-semibold">{title}</h3>
            )}
            {subtitle && (
              <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}