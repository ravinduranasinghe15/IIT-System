"use client";

import Link from "next/link";
import { ArrowRight, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/contexts/app-context";
import { formatDateTime } from "@/lib/date-utils";

export function ImportActivity() {
  const { db } = useApp();
  const list = [...db.imports].sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1)).slice(0, 5);
  return (
    <SectionCard
      title="Recent import activity"
      description="Terminal report uploads"
      bodyClassName="p-0"
      actions={
        <Button variant="ghost" size="sm" render={<Link href="/terminal-imports" />}>
          History <ArrowRight />
        </Button>
      }
    >
      {list.length === 0 ? (
        <EmptyState icon={FileSpreadsheet} title="No imports yet" description="Upload a terminal report to see activity here." />
      ) : (
        <ul className="divide-y">
          {list.map((i) => (
            <li key={i.id}>
              <Link href={`/terminal-imports/${i.id}`} className="flex items-start justify-between gap-3 px-4 py-2.5 hover:bg-muted/50">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-ink">{i.fileName}</div>
                  <div className="truncate text-xs text-slate">
                    {i.id} · {i.terminal} · {formatDateTime(i.uploadedAt)}
                  </div>
                  <div className="text-xs text-slate">
                    <span className="text-success">{i.success} ok</span> · <span className="text-danger">{i.failed} failed</span> · <span className="text-amber-600">{i.duplicate} duplicate</span>
                  </div>
                </div>
                <StatusBadge status={i.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
