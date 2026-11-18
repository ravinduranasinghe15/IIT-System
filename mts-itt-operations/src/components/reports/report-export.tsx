"use client";

import { Download, FileSpreadsheet, FileText, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApp } from "@/contexts/app-context";
import { downloadBlob, downloadCsv } from "@/lib/export-utils";
import { formatDate } from "@/lib/date-utils";
import { exportRows, reportMeta, type ReportFilters, type ReportResult, type ReportType } from "@/lib/reports";
import { formatMoney, formatNumber } from "@/lib/utils";
import type { DB } from "@/types/db";

/** Human-readable list of the filters applied to a report (period always, others only when set and used by this report). */
export function filterSummary(type: ReportType, f: ReportFilters, db: DB): [string, string][] {
  const meta = reportMeta(type);
  const out: [string, string][] = [["Period (operational days)", `${formatDate(f.from)} to ${formatDate(f.to)}`]];
  const on = (k: keyof ReportFilters) => meta.filters.includes(k) && !!f[k];
  if (on("terminal")) out.push(["Terminal", f.terminal]);
  if (on("driverId")) out.push(["Driver", `${f.driverId} · ${db.drivers.find((d) => d.id === f.driverId)?.name ?? ""}`]);
  if (on("vehicleId")) out.push(["Vehicle", `${f.vehicleId} · ${db.primeMovers.find((p) => p.id === f.vehicleId)?.regNo ?? ""}`]);
  if (on("route")) out.push(["Route", f.route.replace("-", " → ")]);
  if (on("size")) out.push(["Container size", f.size]);
  if (on("status")) out.push(["Movement status", f.status]);
  if (on("shift")) out.push(["Shift", f.shift === "Morning" ? "Morning (07:00–19:00)" : "Night (19:00–07:00)"]);
  return out;
}

/** File name that carries the applied filters, e.g. mts-movements-report_2026-11-01_to_2026-11-13_CWIT_PM-001 */
function fileBase(type: ReportType, f: ReportFilters, db: DB): string {
  const extras = filterSummary(type, f, db)
    .slice(1)
    .map(([, v]) => v.split(" ·")[0].replace(/\s*→\s*/g, "-").replace(/\s+/g, "-"));
  return ["mts", type, "report", `${f.from}_to_${f.to}`, ...extras].join("_").replace(/[^A-Za-z0-9_.-]/g, "");
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function cellText(kind: ReportResult["columns"][number]["kind"], v: string | number | null, currency: string): string {
  if (v === null || v === "") return "—";
  switch (kind) {
    case "int":
      return formatNumber(Number(v));
    case "dec":
      return formatNumber(Number(v), 2);
    case "pct":
      return `${Number(v).toFixed(1)}%`;
    case "money":
      return formatMoney(Number(v), currency).replace(`${currency} `, "");
    default:
      return String(v);
  }
}

export function ReportExport({ type, filters, result, disabled }: { type: ReportType; filters: ReportFilters; result: ReportResult; disabled?: boolean }) {
  const { db } = useApp();
  const meta = reportMeta(type);
  const currency = db.settings.currency;
  const empty = disabled || result.rows.length === 0;
  const base = fileBase(type, filters, db);
  const applied = filterSummary(type, filters, db);
  const generated = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

  const done = (label: string) => toast.success(`${meta.label} downloaded as ${label}`, { description: `${result.rows.length} rows · ${applied.map(([k, v]) => `${k}: ${v}`).join(" · ")}` });

  const csv = () => {
    downloadCsv(base, exportRows(result), result.columns.map((c) => c.label));
    done("CSV");
  };

  const xlsx = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportRows(result));
    XLSX.utils.book_append_sheet(wb, ws, meta.label.slice(0, 31));
    const info: (string | number)[][] = [
      ["MTS ITT Operations – report"],
      ["Report", meta.label],
      ["Description", meta.description],
      ["Generated", generated],
      ["Rows", result.rows.length],
      [],
      ["Filters applied"],
      ...applied,
      [],
      ["Summary"],
      ...result.summary.map((s) => [s.label, s.value]),
      ...(result.notes.length ? [[], ["Notes"], ...result.notes.map((n) => [n])] : []),
    ];
    const wsInfo = XLSX.utils.aoa_to_sheet(info);
    wsInfo["!cols"] = [{ wch: 28 }, { wch: 60 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, "Filters & summary");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    downloadBlob(new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${base}.xlsx`);
    done("Excel");
  };

  /** PDF: opens a clean print view (choose "Save as PDF" in the print dialog). */
  const pdf = () => {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Pop-up blocked", { description: "Allow pop-ups for this site to open the printable report." });
      return;
    }
    const head = result.columns.map((c) => `<th class="${c.kind === "text" ? "" : "r"}">${esc(c.label)}</th>`).join("");
    const body = result.rows
      .map((r) => `<tr>${result.columns.map((c) => `<td class="${c.kind === "text" ? "" : "r"}">${esc(cellText(c.kind, (r[c.key] ?? null) as string | number | null, currency))}</td>`).join("")}</tr>`)
      .join("");
    const summary = result.summary.map((s) => `<div class="card"><div class="k">${esc(s.label)}</div><div class="v">${esc(s.value)}</div></div>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(meta.label)} – ${esc(filters.from)} to ${esc(filters.to)}</title>
<style>
 body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:24px;font-size:12px}
 h1{font-size:20px;margin:0 0 2px;color:#142c4c} .sub{color:#64748b;margin-bottom:12px}
 .filters{background:#f1f5f9;border-radius:6px;padding:8px 12px;margin-bottom:12px}
 .filters span{display:inline-block;margin-right:16px}.filters b{color:#142c4c}
 .cards{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}.card{border:1px solid #cbd5e1;border-radius:6px;padding:6px 10px;min-width:120px}
 .k{color:#64748b;font-size:10px;text-transform:uppercase}.v{font-size:15px;font-weight:bold}
 table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}th{background:#142c4c;color:#fff;font-size:11px}
 td.r,th.r{text-align:right} tr:nth-child(even) td{background:#f8fafc}
 .foot{margin-top:10px;color:#64748b;font-size:10px}
 @media print{body{margin:10mm}}
</style></head><body>
<h1>${esc(meta.label)}</h1>
<div class="sub">MTS ITT Operations · generated ${esc(generated)} · ${result.rows.length} row(s)</div>
<div class="filters">${applied.map(([k, v]) => `<span>${esc(k)}: <b>${esc(v)}</b></span>`).join("")}</div>
${summary ? `<div class="cards">${summary}</div>` : ""}
<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
${result.notes.length ? `<div class="foot">${result.notes.map(esc).join(" · ")}</div>` : ""}
<script>window.onload=function(){setTimeout(function(){window.print()},300)}</script>
</body></html>`);
    w.document.close();
    done("a printable PDF view");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button size="sm" disabled={empty} />}>
        <Download /> Download report
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5 text-xs text-slate">
          Downloads the rows for the filters currently applied ({result.rows.length} row{result.rows.length === 1 ? "" : "s"}).
        </div>
        <DropdownMenuItem onClick={xlsx}>
          <FileSpreadsheet /> Excel (.xlsx) with filters sheet
        </DropdownMenuItem>
        <DropdownMenuItem onClick={csv}>
          <FileText /> CSV (.csv)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={pdf}>
          <Printer /> PDF (print view)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
