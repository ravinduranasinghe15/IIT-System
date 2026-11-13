"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CopyCheck, Download, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { ImportRowResult } from "@/types/import";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/search-input";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { downloadCsv } from "@/lib/export-utils";
import { CSV_COLUMNS, rowsToCsvRows, type ProcessSummary } from "@/lib/import-processor";
import { cn } from "@/lib/utils";
import { shortDateTime } from "./import-common";

type Filter = "all" | "ok" | "warn" | "invalid" | "duplicate";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ok", label: "Valid" },
  { key: "warn", label: "Warnings" },
  { key: "invalid", label: "Invalid" },
  { key: "duplicate", label: "Duplicates" },
];

function bucket(r: ImportRowResult): Filter {
  if (r.status === "Invalid") return "invalid";
  if (r.status === "Duplicate") return "duplicate";
  return r.warnings.length ? "warn" : "ok";
}

export function ValidationSummary({ summary, included }: { summary: ProcessSummary; included: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <StatCard label="Rows in file" value={summary.total} icon={CopyCheck} tone="navy" />
      <StatCard label="Valid" value={summary.valid} icon={CheckCircle2} tone="green" hint="No issues" />
      <StatCard label="Valid with warnings" value={summary.withWarnings} icon={AlertTriangle} tone="orange" hint="Import + exception" />
      <StatCard label="Invalid" value={summary.invalid} icon={XCircle} tone="red" hint="Rejected, kept in record" />
      <StatCard label="Potential duplicates" value={summary.duplicates} icon={CopyCheck} tone="orange" hint={included ? `${included} included anyway` : "Held for review"} />
    </div>
  );
}

/** Row-level results (used in the validation step and on the import detail page). */
export function RowResultsTable({
  rows,
  included,
  onToggleInclude,
  canInclude = true,
  fileLabel = "import",
  pageSize = 15,
}: {
  rows: ImportRowResult[];
  /** Duplicate row numbers the reviewer chose to import anyway (validation step only) */
  included?: ReadonlySet<number>;
  onToggleInclude?: (rowNo: number, on: boolean) => void;
  canInclude?: boolean;
  fileLabel?: string;
  pageSize?: number;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, ok: 0, warn: 0, invalid: 0, duplicate: 0 };
    for (const r of rows) c[bucket(r)]++;
    return c;
  }, [rows]);
  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && bucket(r) !== filter) return false;
      if (!s) return true;
      return (
        String(r.rowNo) === s ||
        (r.data.containerNo ?? "").toLowerCase().includes(s) ||
        (r.data.driver ?? "").toLowerCase().includes(s) ||
        (r.data.truckNo ?? "").toLowerCase().includes(s) ||
        r.errors.concat(r.warnings).join(" ").toLowerCase().includes(s)
      );
    });
  }, [rows, filter, q]);

  const selectable = !!onToggleInclude;
  const columns: Column<ImportRowResult>[] = [
    { key: "row", header: "Row", sortValue: (r) => r.rowNo, cell: (r) => <span className="font-mono text-xs text-slate">{r.rowNo}</span> },
    {
      key: "result",
      header: "Result",
      sortValue: (r) => bucket(r),
      cell: (r) => {
        const forced = r.status === "Duplicate" && included?.has(r.rowNo);
        if (forced) return <StatusBadge status="Imported" className="bg-amber-50 text-amber-700 ring-amber-600/20" />;
        if (r.status === "Imported" && r.warnings.length) return <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">Valid · warnings</span>;
        return <StatusBadge status={r.status} />;
      },
    },
    { key: "container", header: "Container(s)", sortValue: (r) => r.data.containerNo ?? "", cell: (r) => <span className="whitespace-nowrap font-mono text-xs">{r.data.containerNo || <em className="not-italic text-danger">missing</em>}</span> },
    { key: "size", header: "Size", cell: (r) => r.data.containerSize ?? "—" },
    { key: "route", header: "Route", cell: (r) => <span className="whitespace-nowrap">{r.data.sourceTerminal ?? "—"} → {r.data.destinationTerminal ?? "—"}</span> },
    { key: "truck", header: "Truck", cell: (r) => r.data.truckNo || <span className="text-amber-600">—</span> },
    { key: "driver", header: "Driver", cell: (r) => <span className="whitespace-nowrap">{r.data.driver || <span className="text-amber-600">—</span>}</span> },
    { key: "load", header: "Loading", sortValue: (r) => r.data.loadingAt ?? "", cell: (r) => <span className="whitespace-nowrap text-xs">{shortDateTime(r.data.loadingAt)}</span> },
    { key: "disch", header: "Discharge", cell: (r) => <span className="whitespace-nowrap text-xs">{shortDateTime(r.data.dischargeAt)}</span> },
    { key: "mstatus", header: "Status", cell: (r) => (r.data.status ? <StatusBadge status={r.data.status} /> : "—") },
    {
      key: "issues",
      header: "Issues",
      className: "min-w-72 whitespace-normal",
      cell: (r) => (
        <ul className="space-y-0.5 text-xs">
          {r.errors.map((e) => (
            <li key={e} className="flex gap-1 text-danger"><XCircle className="mt-0.5 size-3 shrink-0" />{e}</li>
          ))}
          {r.status === "Duplicate" && r.duplicateOf && (
            <li className="flex gap-1 text-amber-700">
              <CopyCheck className="mt-0.5 size-3 shrink-0" />
              Potential duplicate of{" "}
              {r.duplicateOf.startsWith("MV-") ? (
                <Link href={`/movements/${r.duplicateOf}`} className="font-medium underline">{r.duplicateOf}</Link>
              ) : (
                <b>{r.duplicateOf}</b>
              )}{" "}
              (same container, source terminal and operational day)
            </li>
          )}
          {r.warnings.map((w) => (
            <li key={w} className="flex gap-1 text-amber-700"><AlertTriangle className="mt-0.5 size-3 shrink-0" />{w}</li>
          ))}
          {!r.errors.length && !r.warnings.length && r.status !== "Duplicate" && <li className="text-success">No issues</li>}
        </ul>
      ),
    },
  ];
  if (selectable) {
    columns.push({
      key: "include",
      header: "Import anyway",
      align: "center",
      cell: (r) =>
        r.status === "Duplicate" ? (
          <Checkbox
            checked={included?.has(r.rowNo) ?? false}
            disabled={!canInclude}
            onCheckedChange={(v) => onToggleInclude?.(r.rowNo, Boolean(v))}
            aria-label={`Import duplicate row ${r.rowNo} anyway`}
          />
        ) : (
          <span className="text-xs text-slate">—</span>
        ),
    });
  } else {
    columns.push({
      key: "movement",
      header: "Movement",
      cell: (r) =>
        r.movementId ? (
          <Link href={`/movements/${r.movementId}`} className="font-medium text-brand hover:underline">{r.movementId}</Link>
        ) : (
          <span className="text-xs text-slate">—</span>
        ),
    });
  }

  const downloadRejected = () => {
    const list = rows.filter((r) => r.status === "Invalid" || (r.status === "Duplicate" && !included?.has(r.rowNo)));
    if (!list.length) return toast.info("There are no rejected or held rows to download.");
    downloadCsv(`${fileLabel}-rejected-rows.csv`, rowsToCsvRows(list), CSV_COLUMNS);
    toast.success(`Downloaded ${list.length} rejected / held row(s) as CSV`);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <div className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-0.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium text-slate transition",
                filter === f.key && "bg-background text-navy shadow-sm",
              )}
            >
              {f.label} <span className="ml-0.5 text-[11px] opacity-70">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        <SearchInput value={q} onChange={setQ} placeholder="Search row, container, truck, driver, issue…" className="w-72 max-w-full" />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadRejected}>
            <Download /> Rejected rows (CSV)
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              downloadCsv(`${fileLabel}-row-results.csv`, rowsToCsvRows(rows), CSV_COLUMNS);
              toast.success("Row results downloaded");
            }}
          >
            <Download /> All rows (CSV)
          </Button>
        </div>
      </div>
      <DataTable
        columns={columns}
        rows={visible}
        getRowId={(r) => String(r.rowNo)}
        pageSize={pageSize}
        pageSizeOptions={[15, 30, 100]}
        emptyTitle="No rows match"
        emptyDescription="Change the filter or search term."
        rowClassName={(r) => (r.status === "Invalid" ? "bg-red-50/40" : r.status === "Duplicate" ? "bg-amber-50/40" : undefined)}
      />
    </div>
  );
}
