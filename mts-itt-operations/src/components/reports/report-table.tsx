"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Info } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatMoney, formatNumber } from "@/lib/utils";
import type { Cell, ReportColumn, ReportResult, ReportRow } from "@/lib/reports";

const BADGE_KEYS = new Set(["status", "priority"]);

function link(key: string, row: ReportRow, text: string): ReactNode {
  const id = String(row.id);
  const cls = "font-medium text-brand hover:underline";
  switch (key) {
    case "movementId":
      return <Link className={cls} href={`/movements/${text}`}>{text}</Link>;
    case "exceptionId":
      return <Link className={cls} href={`/exceptions/${text}`}>{text}</Link>;
    case "run":
      return <Link className={cls} href={`/payments/${text}`}>{text}</Link>;
    case "invoiceNo":
      return <Link className={cls} href={`/invoicing/${id}`}>{text}</Link>;
    case "driverId":
      return text.startsWith("DR-") ? <Link className={cls} href={`/drivers/${text}`}>{text}</Link> : text;
    case "vehicleId":
    case "vehicle":
      return text.startsWith("PM-") ? <Link className={cls} href={`/fleet/${text}`}>{text}</Link> : text;
    default:
      return text;
  }
}

function render(c: ReportColumn, row: ReportRow, currency: string): ReactNode {
  const v: Cell = row[c.key] ?? null;
  if (v === null || v === "") return <span className="text-slate">—</span>;
  switch (c.kind) {
    case "int":
      return formatNumber(Number(v));
    case "dec":
      return formatNumber(Number(v), 2);
    case "pct":
      return `${Number(v).toFixed(1)}%`;
    case "money":
      return formatMoney(Number(v), currency).replace(`${currency} `, "");
    default: {
      const t = String(v);
      if (BADGE_KEYS.has(c.key) && t !== "—") return <StatusBadge status={t} />;
      if (c.key === "flag") {
        const tone = t === "Above threshold" ? "bg-red-50 text-red-700 ring-red-600/20" : t === "Within threshold" ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-slate-100 text-slate-600 ring-slate-500/20";
        return <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone}`}>{t}</span>;
      }
      if (c.key === "review" && t !== "—") return <StatusBadge status={t} />;
      return link(c.key, row, t);
    }
  }
}

export function ReportSummary({ result }: { result: ReportResult }) {
  if (!result.summary.length) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {result.summary.map((s) => (
        <StatCard key={s.label} label={s.label} value={s.value} hint={s.hint} className="[&>div:last-child>div:nth-child(2)]:text-xl" />
      ))}
    </div>
  );
}

export function ReportTable({ result, currency, title }: { result: ReportResult; currency: string; title: string }) {
  const columns: Column<ReportRow>[] = result.columns.map((c) => ({
    key: c.key,
    header: c.label,
    align: c.kind === "text" ? "left" : "right",
    sortValue: (r) => {
      const v = r[c.key];
      return v === undefined ? null : v;
    },
    cell: (r) => render(c, r, currency),
  }));
  return (
    <SectionCard
      title={`${title} – data`}
      description={`${result.rows.length} row${result.rows.length === 1 ? "" : "s"} · exports include exactly these rows`}
      bodyClassName="p-0"
    >
      <DataTable
        columns={columns}
        rows={result.rows}
        getRowId={(r) => String(r.id)}
        pageSize={10}
        emptyTitle="No data for the selected filters"
        emptyDescription="No records match this report and filter combination. Try a wider date range or reset the filters."
        hidePagerIfSinglePage
      />
    </SectionCard>
  );
}

export function ReportNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="space-y-1 text-xs text-slate">
      {notes.map((n) => (
        <li key={n} className="flex gap-1.5">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>{n}</span>
        </li>
      ))}
    </ul>
  );
}
