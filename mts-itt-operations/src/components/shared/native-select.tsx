import type { SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

interface Props extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> {
  value: string;
  onValueChange: (value: string) => void;
  options: readonly (Option | string)[];
  /** Adds a leading empty option with this label (value "") */
  placeholder?: string;
}

/** Styled native <select> – simple, accessible and works everywhere (used instead of a custom listbox). */
export function NativeSelect({ value, onValueChange, options, placeholder, className, ...rest }: Props) {
  return (
    <div className={cn("relative", className)}>
      <select
        {...rest}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="h-8 w-full appearance-none rounded-lg border border-input bg-background pl-2.5 pr-8 text-sm text-ink outline-none transition focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const opt = typeof o === "string" ? { value: o, label: o } : o;
          return (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          );
        })}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-4 -translate-y-1/2 text-slate" />
    </div>
  );
}
