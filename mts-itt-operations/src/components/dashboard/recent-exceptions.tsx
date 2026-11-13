"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/contexts/app-context";
import { formatDateTime } from "@/lib/date-utils";

export function RecentExceptions() {
  const { db } = useApp();
  const list = [...db.exceptions]
    .filter((e) => e.status === "Open" || e.status === "Under Review")
    .sort((a, b) => (a.reportedAt < b.reportedAt ? 1 : -1))
    .slice(0, 6);
  return (
    <SectionCard
      title="Recent exceptions"
      description="Open and under-review items blocking billing"
      bodyClassName="p-0"
      actions={
        <Button variant="ghost" size="sm" render={<Link href="/exceptions" />}>
          Queue <ArrowRight />
        </Button>
      }
    >
      {list.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No open exceptions" description="All reconciliation items are resolved." />
      ) : (
        <ul className="divide-y">
          {list.map((e) => (
            <li key={e.id}>
              <Link href={`/exceptions/${e.id}`} className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-muted/50">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{e.type}</div>
                  <div className="truncate text-xs text-slate">
                    {e.id} · {e.movementId} · {e.containerNo} · {formatDateTime(e.reportedAt)}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <StatusBadge status={e.priority} />
                  <StatusBadge status={e.status} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
