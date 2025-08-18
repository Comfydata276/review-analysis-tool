import React from "react";
import { cn } from "../../lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  max?: number;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "success" | "warning" | "destructive";
  showValue?: boolean;
}

export function Progress({
  value,
  max = 100,
  size = "md",
  variant = "default",
  showValue = false,
  className,
  ...props
}: ProgressProps) {
  const percentage = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <div className={cn("w-full", className)} {...props}>
      <div
        className={cn(
          "overflow-hidden rounded-full bg-secondary",
          {
            "h-1": size === "sm",
            "h-2": size === "md", 
            "h-3": size === "lg",
          }
        )}
      >
        <div
          className={cn(
            "h-full transition-all duration-300 ease-in-out",
            {
              "bg-primary": variant === "default",
              "bg-green-500": variant === "success",
              "bg-yellow-500": variant === "warning",
              "bg-destructive": variant === "destructive",
            }
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
      {showValue && (
        <div className="mt-1 text-xs text-muted-foreground">
          {Math.round(percentage)}%
        </div>
      )}
    </div>
  );
}
