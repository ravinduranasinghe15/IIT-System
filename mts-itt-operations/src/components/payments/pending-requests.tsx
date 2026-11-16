"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BellRing, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { formatDateTime } from "@/lib/date-utils";
import { pendingPayRequests } from "@/lib/mutations/payment";
import { formatMoney } from "@/lib/utils";
import { periodLabel } from "./payment-summary";

/** Number of driver-pay requests waiting for an Administrator (for badges). */
export function usePendingPayRequestCount(): number {
  const { db } = useApp();
  return useMemo(() => pendingPayRequests(db).length, [db]);
}

/**
 * Highlighted section listing driver-pay requests submitted by Finance and waiting for approval.
 * Shown to Administrators (who approve) and to Finance Managers (who can see the request is waiting).
 */
export function PendingPayRequests({ className }: { className?: string }) {
  const { db } = useApp();
  const { can, role } = useAuth();
  const requests = useMemo(() => pendingPayRequests(db), [db]);
  if (requests.length === 0 || (role !== "Administrator" && role !== "Finance Manager")) return null;
  const approver = can("payments.approve");

  return (
    <section className={`rounded-xl border-2 border-amber-300 bg-amber-50/70 shadow-sm ${className ?? ""}`} aria-label="Driver payment requests waiting for approval">
      <header className="flex items-center gap-2 border-b border-amber-200 px-4 py-3">
        <BellRing className="size-4 text-amber-600" />
        <h2 className="text-sm font-semibold text-amber-900">
          {requests.length} driver payment request{requests.length === 1 ? "" : "s"} waiting for {approver ? "your approval" : "Administrator approval"}
        </h2>
      </header>
      <ul className="divide-y divide-amber-200">
        {requests.map((r) => (
          <li key={r.run.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-ink">
                {r.run.id} · {periodLabel(r.run.periodStart, r.run.periodEnd)}
              </div>
              <div className="text-xs text-slate">
                Submitted by {r.submittedBy} · {formatDateTime(r.submittedAt)} · {r.run.lines.length} driver{r.run.lines.length === 1 ? "" : "s"} · total{" "}
                <span className="font-semibold text-ink">{formatMoney(r.total, r.run.currency)}</span>
              </div>
              {r.note && <div className="mt-0.5 text-xs text-slate">Note: {r.note}</div>}
            </div>
            <Button size="sm" variant={approver ? "default" : "outline"} render={<Link href={`/payments/${r.run.id}`} />} nativeButton={false}>
              <ShieldCheck /> {approver ? "Review & approve" : "View request"}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
