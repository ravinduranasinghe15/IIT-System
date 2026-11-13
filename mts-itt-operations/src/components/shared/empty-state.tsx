import type { ReactNode } from "react";
import { Inbox, type LucideIcon } from "lucide-react";

export function EmptyState({
  title = "Nothing to show",
  description,
  icon: Icon = Inbox,
  action,
}: {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <div className="flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate">
        <Icon className="size-5" />
      </div>
      <div className="text-sm font-semibold text-ink">{title}</div>
      {description && <div className="max-w-sm text-sm text-slate">{description}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
