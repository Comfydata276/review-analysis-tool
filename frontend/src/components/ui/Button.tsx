import React from "react";
import { cn } from "@/lib/utils";

type Variant =
  | "default"
  | "destructive"
  | "outline"
  | "ghost"
  | "gradient"
  | "secondary";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
};

export const Button = React.forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "default", size = "md", disabled, ...props }, ref) => {
    const base = "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none";
    const sizes: Record<string, string> = {
      sm: "px-2 py-1",
      md: "px-4 py-2",
      lg: "px-5 py-3 text-base",
    };
    const variants: Record<Variant, string> = {
      default: "bg-card text-card-foreground border border-border",
      destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      outline: "bg-transparent border border-border",
      ghost: "bg-transparent",
      gradient: "bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow",
      secondary: "bg-secondary text-secondary-foreground",
    };

    return (
      <button
        ref={ref}
        className={cn(base, sizes[size], variants[variant], className)}
        disabled={disabled}
        {...props}
      />
    );
  }
);

Button.displayName = "Button";


