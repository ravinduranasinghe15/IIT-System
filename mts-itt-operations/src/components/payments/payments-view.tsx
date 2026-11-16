"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Banknote, CalendarRange, CheckCircle2, FilePlus2, Radio, Route, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/shared/section-card";
import { NativeSelect } from "@/components/shared/native-select";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { formatDateTime, payPeriods } from "@/lib/date-utils";
import { computePayLines } from "@/lib/payment-calculator";
import { formatMoney, formatNumber } from "@/lib/utils";
import type { PayLine } from "@/types/payment";
import { PayLinesTable, PayRunsTable } from "./payment-table";
import { PayRulesNote, periodLabel } from "./payment-summary";
import { GeneratePayDialog } from "./generate-dialog";
import { PayBreakdownDialog } from "./payment-breakdown";
import { PendingPayRequests } from "./pending-requests";

export function PaymentsView() {
  const { db } = useApp();
  const { can, canSeeFinancials } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [localOpen, setLocalOpen] = useState(false);
  const open = params.get("action") === "generate" || localOpen;
  const periods = useMemo(() => payPeriods(6), []);
  const [periodStart, setPeriodStart] = useState(periods[0].start);
  const [breakdown, setBreakdown] = useState<PayLine | null>(null);

  const period = periods.find((p) => p.start === periodStart) ?? periods[0];
  const run = db.payRuns.find((r) => r.periodStart === period.start && r.periodEnd === period.end);
  const lines = useMemo(() => {
    if (run?.status === "Approved") return run.lines;
    return computePayLines(db, period.start, period.end, run?.lines);
  }, [db, period, run]);
  const rowStatus = run ? run.status : "Not generated";

  const onOpenChange = (o: boolean) => {
    setLocalOpen(o);
    if (!o && params.get("action")) router.replace("/payments");
  };

  const sum = (r: typeof db.payRuns[number]) => r.lines.reduce((s, l) => s + l.total, 0);
  const draftTotal = db.payRuns.filter((r) => r.status === "Draft").reduce((s, r) => s + sum(r), 0);
  const approvedTotal = db.payRuns.filter((r) => r.status === "Approved").reduce((s, r) => s + sum(r), 0);
  const eligible = lines.reduce((s, l) => s + l.movementIds.length, 0);
  const currency = db.settings.currency;
  const live = db.payRuns.find((r) => r.periodStart === periods[0].start && r.periodEnd === periods[0].end);
  const liveTotal = live ? live.lines.reduce((s, l) => s + l.total, 0) : 0;
  const livePending = live ? live.lines.reduce((s, l) => s + (l.pendingAmount ?? 0), 0) : 0;
  const lastEvent = live ? live.history[live.history.length - 1] : null;

  if (!canSeeFinancials) return null;

  return (
    <div>
      <PageHeader
        title="Driver Payments"
        description="15-day driver pay drafts: eligible movements, rates, adjustments and simulated approval."
        actions={
          can("payments.manage") && (
            <Button onClick={() => setLocalOpen(true)}>
              <FilePlus2 /> Generate pay draft
            </Button>
          )
        }
      />

      <PendingPayRequests className="mb-4" />

      <SectionCard
        className="mb-4 border-brand/30"
        title={`Current pay period · ${periodLabel(periods[0].start, periods[0].end)}`}
        description={
          live?.status === "Approved"
            ? "This period is approved and locked."
            : "Updates automatically whenever movements, exceptions or drivers change. Review it, then submit and approve."
        }
        actions={
          <>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${live?.status === "Approved" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-sky-50 text-sky-700 ring-sky-600/20"}`}>
              <Radio className="size-3.5" /> {live?.status === "Approved" ? "Approved" : "Live"}
            </span>
            {live && (
              <Button size="sm" onClick={() => router.push(`/payments/${live.id}`)}>
                Open {live.id}
              </Button>
            )}
          </>
        }
      >
        {live ? (
          <div className="grid gap-3 sm:grid-cols-4">
            <div>
              <div className="text-xs text-slate">Confirmed earnings</div>
              <div className="text-xl font-semibold text-ink">{formatMoney(liveTotal, currency)}</div>
            </div>
            <div>
              <div className="text-xs text-slate">Pending (held by exceptions)</div>
              <div className="text-xl font-semibold text-amber-600">{formatMoney(livePending, currency)}</div>
            </div>
            <div>
              <div className="text-xs text-slate">Drivers with earnings</div>
              <div className="text-xl font-semibold text-ink">{live.lines.filter((l) => l.driverId !== "UNASSIGNED" && l.total > 0).length}</div>
            </div>
            <div className="min-w-0">
              <div className="text-xs text-slate">Last change</div>
              <div className="truncate text-sm text-ink" title={lastEvent?.note}>{lastEvent ? `${lastEvent.action} · ${formatDateTime(lastEvent.at)}` : "—"}</div>
              <div className="line-clamp-2 text-xs text-slate">{lastEvent?.note}</div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate">No movements in this period yet. Import a terminal report and this fills in by itself.</p>
        )}
      </SectionCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Current Pay Period" value={`${periods[0].index + 1}`} icon={CalendarRange} tone="navy" hint={periodLabel(periods[0].start, periods[0].end)} />
        <StatCard label="Total Drivers" value={lines.filter((l) => l.driverId !== "UNASSIGNED").length} icon={Users} tone="blue" hint="In selected period" />
        <StatCard label="Eligible Movements" value={formatNumber(eligible)} icon={Route} tone="green" hint="In selected period" />
        <StatCard label="Draft Payments" value={formatMoney(draftTotal, currency)} icon={Banknote} tone="orange" hint={`${db.payRuns.filter((r) => r.status === "Draft").length} draft run(s)`} />
        <StatCard label="Approved Payments" value={formatMoney(approvedTotal, currency)} icon={CheckCircle2} tone="green" hint={`${db.payRuns.filter((r) => r.status === "Approved").length} approved run(s)`} />
      </div>

      <div className="mt-4">
        <PayRulesNote unitMode={run?.unitMode ?? db.settings.payUnitMode} rates={run?.rates ?? db.settings.payRates} currency={currency} />
      </div>

      <SectionCard
        className="mt-4"
        title="Pay runs"
        description="Generated drafts and approved runs. Approved runs are immutable."
        bodyClassName="p-0"
      >
        <PayRunsTable runs={db.payRuns} currency={currency} />
      </SectionCard>

      <SectionCard
        className="mt-4"
        title="Driver earnings by period"
        description={
          run
            ? `Showing ${run.id}. Open the pay run to adjust and approve.`
            : "Live preview – no pay run generated for this period yet."
        }
        actions={
          <>
            <StatusBadge status={rowStatus} className={rowStatus === "Not generated" ? "" : undefined} />
            <NativeSelect
              className="w-56"
              value={period.start}
              onValueChange={setPeriodStart}
              options={periods.map((p) => ({ value: p.start, label: periodLabel(p.start, p.end) }))}
              aria-label="Pay period"
            />
            {run ? (
              <Button size="sm" variant="outline" onClick={() => router.push(`/payments/${run.id}`)}>
                Open {run.id}
              </Button>
            ) : (
              can("payments.manage") && (
                <Button size="sm" onClick={() => setLocalOpen(true)}>
                  Generate draft
                </Button>
              )
            )}
          </>
        }
        bodyClassName="p-0"
      >
        <PayLinesTable lines={lines} currency={currency} status={rowStatus} onBreakdown={setBreakdown} />
      </SectionCard>

      {open && <GeneratePayDialog open={open} onOpenChange={onOpenChange} initialStart={period.start} />}
      <PayBreakdownDialog
        line={breakdown}
        onClose={() => setBreakdown(null)}
        unitMode={run?.unitMode ?? db.settings.payUnitMode}
        rates={run?.rates ?? db.settings.payRates}
        currency={currency}
      />
    </div>
  );
}
