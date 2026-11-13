"use client";

import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { downloadCsv, downloadXlsx } from "@/lib/export-utils";
import { exportRows, reportMeta, type ReportFilters, type ReportResult, type ReportType } from "@/lib/reports";

export function ReportExport({ type, filters, result, disabled }: { type: ReportType; filters: ReportFilters; result: ReportResult; disabled?: boolean }) {
  const meta = reportMeta(type);
  const base = `mts-${type}-report_${filters.from}_${filters.to}`;
  const empty = disabled || result.rows.length === 0;

  const run = (kind: "csv" | "xlsx") => {
    const rows = exportRows(result);
    if (!rows.length) {
      toast.error("Nothing to export", { description: "The current filters match no rows." });
      return;
    }
    if (kind === "csv") downloadCsv(base, rows, result.columns.map((c) => c.label));
    else downloadXlsx(base, rows, meta.label);
    toast.success(`${meta.label} exported as ${kind.toUpperCase()}`, { description: `${rows.length} rows · ${filters.from} to ${filters.to}` });
  };

  return (
    <>
      <Button variant="outline" size="sm" disabled={empty} onClick={() => run("csv")}>
        <Download /> Export CSV
      </Button>
      <Button size="sm" disabled={empty} onClick={() => run("xlsx")}>
        <FileSpreadsheet /> Export Excel
      </Button>
    </>
  );
}
