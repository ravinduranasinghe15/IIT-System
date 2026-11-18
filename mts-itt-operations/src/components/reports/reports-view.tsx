"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Banknote,
  CalendarDays,
  CalendarRange,
  Clock,
  Fuel,
  Lock,
  MapPinned,
  Package,
  Receipt,
  Route,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { buildAnalytics, buildReport, defaultFilters, REPORTS, reportMeta, type ReportFilters, type ReportType } from "@/lib/reports";
import { ReportFiltersBar } from "./report-filters";
import { ReportExport } from "./report-export";
import { AnalyticsCharts, ReportChart } from "./report-charts";
import { ReportNotes, ReportSummary, ReportTable } from "./report-table";
import { IttAnalysisReport } from "./itt-analysis-report";

const ICONS: Record<ReportType, LucideIcon> = {
  daily: CalendarDays,
  weekly: CalendarRange,
  monthly: BarChart3,
  driver: Users,
  vehicle: Truck,
  terminal: MapPinned,
  route: Route,
  container: Package,
  exception: AlertTriangle,
  payment: Banknote,
  invoice: Receipt,
  fuel: Fuel,
};

export function ReportsView() {
  const { db } = useApp();
  const { role, can } = useAuth();
  const canFinancial = role === "Manager" || role === "CEO";
  const allowed = can("reports.view");

  const [mode, setMode] = useState<"standard" | "itt">("itt");
  const [type, setType] = useState<ReportType>("daily");
  const [filters, setFilters] = useState<ReportFilters>(defaultFilters);

  const visible = REPORTS.filter((r) => !r.financial || canFinancial);
  const activeType: ReportType = visible.some((r) => r.type === type) ? type : "daily";
  const meta = reportMeta(activeType);

  const result = useMemo(() => buildReport(activeType, filters, db, canFinancial), [activeType, filters, db, canFinancial]);
  const analytics = useMemo(() => buildAnalytics(filters, db, canFinancial), [filters, db, canFinancial]);

  if (!allowed) {
    return (
      <div>
        <PageHeader title="Reports & Analytics" />
        <EmptyState icon={Lock} title="Reports are not available for your role" description="Reports are available to the CEO and the Manager." />
      </div>
    );
  }

  const groups = ["Movement", "Performance", "Quality", "Finance & Fuel"] as const;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Reports & Analytics"
        description="The MTS ITT analysis dashboard plus twelve operational and financial reports, generated for any day, week, month or custom range, with Excel, CSV or PDF download."
        actions={mode === "standard" ? <ReportExport type={activeType} filters={filters} result={result} /> : undefined}
      />

      <div className="flex w-fit overflow-hidden rounded-lg border text-sm">
        {([["itt", "ITT analysis (MTS format)"], ["standard", "Standard reports"]] as const).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={mode === k} onClick={() => setMode(k)} className={cn("px-4 py-2 font-medium", mode === k ? "bg-navy text-white" : "bg-card text-slate hover:bg-muted")}>
            {label}
          </button>
        ))}
      </div>

      {mode === "itt" ? <IttAnalysisReport /> : <>

      <div className="flex items-start gap-2 rounded-lg border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-slate">
        <Clock className="mt-0.5 size-3.5 shrink-0 text-brand" />
        <p>
          <span className="font-medium text-navy">Operational day boundary:</span> every date here is an operational day running{" "}
          {String(db.settings.opDayStartHour).padStart(2, "0")}:00 → {String(db.settings.opDayStartHour).padStart(2, "0")}:00 ({db.settings.timezone}). A movement loaded at 02:30 on the 5th belongs to the 4th.
          Weeks are ISO (Mon–Sun) and months are calendar months, both of operational days.
        </p>
      </div>

      <section aria-label="Report picker" className="rounded-xl border bg-card p-3 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {groups.map((g) => {
            const items = REPORTS.filter((r) => r.group === g);
            return (
              <div key={g}>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate">{g}</div>
                <div className="flex flex-col gap-1">
                  {items.map((r) => {
                    const Icon = ICONS[r.type];
                    const locked = r.financial && !canFinancial;
                    const active = r.type === activeType;
                    return (
                      <button
                        key={r.type}
                        type="button"
                        disabled={locked}
                        title={locked ? "Restricted to the CEO and the Manager" : r.description}
                        onClick={() => setType(r.type)}
                        aria-pressed={active}
                        className={cn(
                          "flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-sm transition",
                          active ? "border-navy bg-navy text-white" : "bg-card text-ink hover:border-brand/40",
                          locked && "cursor-not-allowed opacity-50 hover:border-border",
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="flex-1 truncate">{r.label}</span>
                        {locked ? <Lock className="size-3.5" /> : r.financial && <Banknote className="size-3.5 opacity-70" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <ReportFiltersBar db={db} filters={filters} onChange={setFilters} supported={meta.filters} downloadSlot={<ReportExport type={activeType} filters={filters} result={result} />} />

      <div className="flex items-center gap-2 text-sm">
        <h2 className="text-base font-semibold text-navy">{meta.label} Report</h2>
        <span className="text-slate">· {meta.description}</span>
      </div>

      <ReportSummary result={result} />
      <ReportChart spec={result.chartData} />
      <ReportTable result={result} currency={db.settings.currency} title={meta.label} />
      <ReportNotes notes={result.notes} />

      <AnalyticsCharts data={analytics} canFinancial={canFinancial} currency={db.settings.currency} />
      </>}
    </div>
  );
}
