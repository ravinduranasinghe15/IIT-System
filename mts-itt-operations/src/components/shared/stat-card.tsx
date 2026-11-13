import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "navy" | "green" | "orange" | "red" | "blue" | "grey";

const TONES: Record<Tone, string> = {
  navy: "bg-navy/10 text-navy",
  green: "bg-success/10 text-success",
  orange: "bg-warning/15 text-amber-600",
  red: "bg-danger/10 text-danger",
  blue: "bg-brand/10 text-brand",
  grey: "bg-slate-100 text-slate",
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "navy",
  onClick,
  className,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon?: LucideIcon;
  tone?: Tone;
  onClick?: () => void;
  className?: string;
}) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-card p-4 text-left shadow-sm",
        onClick && "cursor-pointer transition hover:border-brand/40 hover:shadow-md",
        className,
      )}
    >
      {Icon && (
        <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
          <Icon className="size-5" />
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-xs font-medium uppercase tracking-wide text-slate">{label}</div>
        <div className="text-2xl font-semibold leading-tight text-ink">{value}</div>
        {hint && <div className="truncate text-xs text-slate">{hint}</div>}
      </div>
    </Comp>
  );
}
