"use client";

import Link from "next/link";
import { Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime } from "@/lib/date-utils";
import { formatMoney, formatNumber } from "@/lib/utils";
import type { PayLine, PayRun } from "@/types/payment";
import { periodLabel } from "./payment-summary";

/** Per-driver pay lines (Driver ID, Name, Completed, Units, Rate, Adjustments, Total, Status, Actions). */
export function PayLinesTable({
  lines,
  currency,
  status,
  editable,
  onBreakdown,
  onAdjust,
  pageSize = 10,
}: {
  lines: PayLine[];
  currency: string;
  status: string;
  editable?: boolean;
  onBreakdown: (line: PayLine) => void;
  onAdjust?: (line: PayLine) => void;
  pageSize?: number;
}) {
  const columns: Column<PayLine>[] = [
    {
      key: "id",
      header: "Driver ID",
      sortValue: (l) => l.driverId,
      cell: (l) =>
        l.driverId === "UNASSIGNED" ? (
          <span className="text-slate">—</span>
        ) : (
          <Link href={`/drivers/${l.driverId}`} className="font-medium text-brand hover:underline" onClick={(e) => e.stopPropagation()}>
            {l.driverId}
          </Link>
        ),
    },
    { key: "name", header: "Name", sortValue: (l) => l.driverName, cell: (l) => <span className="font-medium text-ink">{l.driverName}</span> },
    { key: "mv", header: "Completed Movements", align: "right", sortValue: (l) => l.completedMovements, cell: (l) => formatNumber(l.completedMovements) },
    { key: "units", header: "Eligible Payable Units", align: "right", sortValue: (l) => l.payableUnits, cell: (l) => formatNumber(l.payableUnits) },
    { key: "rate", header: "Rate (blended)", align: "right", sortValue: (l) => l.rate, cell: (l) => formatMoney(l.rate, currency) },
    {
      key: "adj",
      header: "Adjustments",
      align: "right",
      sortValue: (l) => l.adjustments,
      cell: (l) => (
        <span className={l.adjustments < 0 ? "text-danger" : l.adjustments > 0 ? "text-success" : "text-slate"} title={l.adjustmentNote || undefined}>
          {formatMoney(l.adjustments, currency)}
        </span>
      ),
    },
    {
      key: "excl",
      header: "Excluded",
      align: "right",
      sortValue: (l) => l.excluded.length,
      cell: (l) => (l.excluded.length ? <span className="font-medium text-amber-600">{l.excluded.length}</span> : <span className="text-slate">0</span>),
    },
    { key: "total", header: "Total Earnings", align: "right", sortValue: (l) => l.total, cell: (l) => <span className="font-semibold text-ink">{formatMoney(l.total, currency)}</span> },
    { key: "status", header: "Status", cell: () => <StatusBadge status={status} /> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (l) => (
        <div className="flex justify-end gap-1">
          <Button size="xs" variant="outline" onClick={() => onBreakdown(l)}>
            <Eye /> Breakdown
          </Button>
          {editable && onAdjust && l.driverId !== "UNASSIGNED" && (
            <Button size="xs" variant="outline" onClick={() => onAdjust(l)}>
              <Pencil /> Adjust
            </Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={lines}
      getRowId={(l) => l.driverId}
      pageSize={pageSize}
      initialSort={{ key: "id", dir: "asc" }}
      emptyTitle="No driver movements in this period"
      emptyDescription="No movements fall within the selected 15-day period."
    />
  );
}

export function PayRunsTable({ runs, currency }: { runs: PayRun[]; currency: string }) {
  const columns: Column<PayRun>[] = [
    {
      key: "id",
      header: "Pay Run",
      sortValue: (r) => r.id,
      cell: (r) => (
        <Link href={`/payments/${r.id}`} className="font-medium text-brand hover:underline">
          {r.id}
        </Link>
      ),
    },
    { key: "period", header: "Period", sortValue: (r) => r.periodStart, cell: (r) => periodLabel(r.periodStart, r.periodEnd) },
    { key: "drivers", header: "Drivers", align: "right", cell: (r) => r.lines.length },
    { key: "units", header: "Units", align: "right", cell: (r) => formatNumber(r.lines.reduce((s, l) => s + l.payableUnits, 0)) },
    {
      key: "total",
      header: "Total",
      align: "right",
      sortValue: (r) => r.lines.reduce((s, l) => s + l.total, 0),
      cell: (r) => <span className="font-semibold">{formatMoney(r.lines.reduce((s, l) => s + l.total, 0), r.currency || currency)}</span>,
    },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    { key: "gen", header: "Generated", sortValue: (r) => r.generatedAt, cell: (r) => <span className="text-slate">{formatDateTime(r.generatedAt)}</span> },
    { key: "appr", header: "Approved By", cell: (r) => <span className="text-slate">{r.approvedBy ?? "—"}</span> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (r) => (
        <Button size="xs" variant="outline" render={<Link href={`/payments/${r.id}`} />} nativeButton={false}>
          <Eye /> Open
        </Button>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={runs}
      getRowId={(r) => r.id}
      pageSize={5}
      pageSizeOptions={[5, 10, 25]}
      initialSort={{ key: "period", dir: "desc" }}
      hidePagerIfSinglePage
      emptyTitle="No pay runs yet"
      emptyDescription="Generate a draft for a 15-day period to create the first pay run."
    />
  );
}
