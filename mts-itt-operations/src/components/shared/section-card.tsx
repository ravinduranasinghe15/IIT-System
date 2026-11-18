import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Titled surface used for charts, tables and detail panels. */
export function SectionCard({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("min-w-0 rounded-xl border bg-card shadow-sm", className)}>
      {(title || actions) && (
        <header className="flex flex-col gap-2 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-navy">{title}</h2>}
            {description && <p className="text-xs text-slate">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function KeyValue({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-ink">{children}</dd>
    </div>
  );
}
