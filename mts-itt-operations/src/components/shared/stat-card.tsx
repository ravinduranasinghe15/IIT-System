import type { ReactNode } from "react";
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
  action,
  className,
}: {
  /** Small control shown at the card's top-right (only when the card itself is not clickable). */
  action?: ReactNode;
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
        "flex items-start gap-3 rounded-xl border bg-card p-3.5 text-left shadow-sm",
        onClick && "cursor-pointer transition hover:border-brand/40 hover:shadow-md",
        className,
      )}
    >
      {Icon && (
        <div className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
          <Icon className="size-[18px]" />
        </div>
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase leading-tight tracking-wide text-slate">{label}</div>
        <div className="text-2xl font-semibold leading-tight text-ink">{value}</div>
        {hint && <div className="text-xs leading-tight text-slate">{hint}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </Comp>
  );
}
