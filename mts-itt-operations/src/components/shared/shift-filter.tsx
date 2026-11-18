"use client";

import { cn } from "@/lib/utils";

export type ShiftValue = "" | "Morning" | "Night";

const OPTIONS: { value: ShiftValue; label: string; hint: string }[] = [
  { value: "", label: "Both shifts", hint: "07:00 → 07:00" },
  { value: "Morning", label: "Morning", hint: "7a – 7p" },
  { value: "Night", label: "Night", hint: "7p – 7a" },
];

/** Segmented control that narrows a dashboard to one shift (a movement belongs to the shift its loading time falls in). */
export function ShiftFilter({ value, onChange, className }: { value: ShiftValue; onChange: (v: ShiftValue) => void; className?: string }) {
  return (
    <div className={cn("flex w-fit overflow-hidden rounded-lg border text-sm", className)} role="group" aria-label="Shift filter">
      {OPTIONS.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          title={o.hint}
          className={cn("px-3 py-2 font-medium", value === o.value ? "bg-navy text-white" : "bg-card text-slate hover:bg-muted")}
        >
          {o.label}
          <span className={cn("ml-1 hidden text-[11px] font-normal sm:inline", value === o.value ? "text-white/70" : "text-slate/70")}>{o.hint}</span>
        </button>
      ))}
    </div>
  );
}
