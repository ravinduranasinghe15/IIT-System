"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/contexts/app-context";
import { addDays, realToday, formatDay } from "@/lib/date-utils";

/** Driver dashboard: own upcoming roster only. */
export function DriverRosterCard({ driverId }: { driverId: string }) {
  const { db } = useApp();
  const today = realToday();
  const to = addDays(today, 6);
  const rows = db.roster.filter((r) => r.driverId === driverId && r.date >= today && r.date <= to).sort((a, b) => (a.date < b.date ? -1 : 1));
  return (
    <SectionCard
      title="My roster"
      description="Next 7 days"
      bodyClassName="p-0"
      actions={
        <Button variant="ghost" size="sm" render={<Link href="/drivers/roster" />}>
          Full roster <ArrowRight />
        </Button>
      }
    >
      {rows.length === 0 ? (
        <EmptyState title="No roster entries" description="No shifts are scheduled for the next 7 days." />
      ) : (
        <ul className="divide-y">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-ink">{formatDay(r.date)}</span>
              <span className="flex items-center gap-2">
                <span className="text-xs text-slate">{r.primeMoverId ?? "—"}</span>
                <StatusBadge status={r.shift} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
