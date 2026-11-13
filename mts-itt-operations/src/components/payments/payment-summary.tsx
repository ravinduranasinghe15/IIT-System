"use client";

import Link from "next/link";
import { Calculator, Info } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { ASSUMPTION_NOTE } from "@/lib/constants";
import { formatDate } from "@/lib/date-utils";
import { formatMoney, formatNumber } from "@/lib/utils";
import type { PayRun, UnitMode } from "@/types/payment";
import { Banknote, CheckCircle2, Route, Users } from "lucide-react";
import { payRunTotals } from "@/lib/payment-calculator";

export const periodLabel = (start: string, end: string) => `${formatDate(start)} – ${formatDate(end)}`;

export const unitModeLabel = (mode: UnitMode) =>
  mode === "per-trailer" ? "Per trailer (1 unit per journey)" : "Per container (1 unit per container)";

/** Formula explainer + demo-assumption label for the pay unit mode. */
export function PayRulesNote({
  unitMode,
  rates,
  currency,
}: {
  unitMode: UnitMode;
  rates: { "20FT": number; "40FT": number };
  currency: string;
}) {
  return (
    <div className="rounded-xl border border-brand/20 bg-brand/5 p-4 text-sm">
      <div className="flex items-start gap-3">
        <Calculator className="mt-0.5 size-4 shrink-0 text-brand" />
        <div className="min-w-0 space-y-1.5">
          <div className="font-semibold text-navy">Total = Eligible Payable Units × Rate + Adjustments</div>
          <p className="text-slate">
            Pay unit mode: <span className="font-medium text-ink">{unitModeLabel(unitMode)}</span>. Rates: 20FT{" "}
            <span className="font-medium text-ink">{formatMoney(rates["20FT"], currency)}</span>, 40FT{" "}
            <span className="font-medium text-ink">{formatMoney(rates["40FT"], currency)}</span> per unit. Movements with unresolved
            exceptions, pending correction approval, no driver or a non-paying status are excluded and listed with reasons.
          </p>
          <p className="flex flex-wrap items-center gap-1 text-xs text-slate">
            <Info className="size-3.5" />
            {ASSUMPTION_NOTE}{" "}
            <Link href="/settings" className="font-medium text-brand underline-offset-2 hover:underline">
              Change in Settings
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function PaySummaryCards({ run }: { run: PayRun }) {
  const t = payRunTotals(run);
  const adjustments = run.lines.reduce((s, l) => s + l.adjustments, 0);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Drivers" value={run.lines.length} icon={Users} tone="navy" hint={periodLabel(run.periodStart, run.periodEnd)} />
      <StatCard label="Eligible Units" value={formatNumber(t.units)} icon={Route} tone="blue" hint={`${t.movements} completed movements · ${t.excluded} excluded`} />
      <StatCard label="Adjustments" value={formatMoney(adjustments, run.currency)} icon={Calculator} tone={adjustments < 0 ? "red" : "orange"} />
      <StatCard
        label={run.status === "Approved" ? "Approved Total" : "Draft Total"}
        value={formatMoney(t.total, run.currency)}
        icon={run.status === "Approved" ? CheckCircle2 : Banknote}
        tone={run.status === "Approved" ? "green" : "orange"}
        hint={run.status === "Approved" ? `Approved by ${run.approvedBy ?? "—"}` : "Not yet approved"}
      />
    </div>
  );
}
