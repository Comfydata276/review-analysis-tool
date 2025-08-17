import React from "react";
import { cn } from "@/lib/utils";

type Option = { label: string; value: string };

type Props = React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: Option[];
  label?: string;
};

export const Select: React.FC<Props> = ({ options, label, className, ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-muted-foreground mb-1">{label}</label>}
      <select
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
        {...props}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
};

Select.displayName = "Select";


