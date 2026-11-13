"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardCheck, Download, Flag } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { NativeSelect } from "@/components/shared/native-select";
import { StatusBadge } from "@/components/shared/status-badge";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field } from "@/components/shared/field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useFleetActions } from "@/hooks/use-fleet";
import { FUEL_REVIEW_STATUSES, fuelMonths, reconcileFuel, type FuelReconRow } from "@/lib/fuel-reconciliation";
import { downloadCsv } from "@/lib/export-utils";
import { formatDateTime, formatMonth } from "@/lib/date-utils";
import { formatNumber, cn } from "@/lib/utils";
import type { FuelReview } from "@/types/fuel";

export function FuelReconciliation({ vehicleId }: { vehicleId?: string }) {
  const { db } = useApp();
  const { can } = useAuth();
  const months = useMemo(() => fuelMonths(db), [db]);
  const [month, setMonth] = useState("");
  const [flagOnly, setFlagOnly] = useState("");
  const [reviewRow, setReviewRow] = useState<FuelReconRow | null>(null);
  const canReview = can("fuel.review");

  const all = useMemo(() => reconcileFuel(db, { vehicleId }), [db, vehicleId]);
  const rows = useMemo(() => all.filter((r) => (!month || r.month === month) && (!flagOnly || (flagOnly === "flagged" ? r.flagged : !r.flagged))), [all, month, flagOnly]);

  const columns: Column<FuelReconRow>[] = [
    { key: "month", header: "Month", sortValue: (r) => r.month, cell: (r) => <span className="whitespace-nowrap">{formatMonth(r.month)}</span> },
    ...(vehicleId ? [] : [{ key: "veh", header: "Vehicle", sortValue: (r: FuelReconRow) => r.vehicleId, cell: (r: FuelReconRow) => <Link href={`/fleet/${r.vehicleId}`} className="font-medium text-brand hover:underline">{r.vehicleId}</Link> }]),
    { key: "gps", header: "GPS litres", align: "right", sortValue: (r) => r.gpsLitres, cell: (r) => <span className="tabular-nums">{formatNumber(r.gpsLitres, 1)}</span> },
    { key: "inv", header: "Invoice litres", align: "right", sortValue: (r) => r.invoiceLitres, cell: (r) => <span className="tabular-nums">{formatNumber(r.invoiceLitres, 1)}</span> },
    { key: "diff", header: "Difference (L)", align: "right", sortValue: (r) => r.difference, cell: (r) => <span className={cn("tabular-nums", r.flagged && "font-semibold")}>{r.difference > 0 ? "+" : ""}{formatNumber(r.difference, 1)}</span> },
    {
      key: "pct",
      header: "Variance %",
      align: "right",
      sortValue: (r) => (r.variancePct === null ? -999 : Math.abs(r.variancePct)),
      cell: (r) => (r.variancePct === null ? <span className="text-slate">n/a</span> : <span className={cn("tabular-nums", r.flagged ? "font-semibold text-danger" : "text-ink")}>{r.variancePct > 0 ? "+" : ""}{r.variancePct.toFixed(1)}%</span>),
    },
    { key: "cons", header: "GPS L/100km", align: "right", cell: (r) => (r.gpsLPer100Km === null ? "—" : r.gpsLPer100Km.toFixed(1)) },
    {
      key: "flag",
      header: "Flag",
      sortValue: (r) => (r.flagged ? 1 : 0),
      cell: (r) =>
        r.flagged ? (
          <span title={r.flagReason} className="inline-flex items-center gap-1 text-xs font-medium text-danger">
            <Flag className="size-3" /> Above threshold
          </span>
        ) : (
          <span title={r.flagReason} className="text-xs text-slate">Within {db.settings.fuelVarianceThresholdPct}%</span>
        ),
    },
    {
      key: "review",
      header: "Review",
      sortValue: (r) => r.reviewStatus,
      cell: (r) =>
        r.reviewStatus === "OK" ? (
          <span className="text-slate">—</span>
        ) : (
          <div>
            <StatusBadge status={r.reviewStatus} />
            {r.review && <div className="mt-0.5 text-[11px] text-slate">{r.review.reviewedBy} · {formatDateTime(r.review.reviewedAt)}</div>}
          </div>
        ),
    },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (r) =>
        canReview ? (
          <Button size="xs" variant={r.flagged && !r.review ? "default" : "outline"} onClick={() => setReviewRow(r)}>
            <ClipboardCheck /> {r.review ? "Update" : "Review"}
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <NativeSelect className="w-44" value={month} onValueChange={setMonth} placeholder="All months" options={months.map((m) => ({ value: m, label: formatMonth(m) }))} aria-label="Month filter" />
        <NativeSelect className="w-40" value={flagOnly} onValueChange={setFlagOnly} placeholder="All rows" options={[{ value: "flagged", label: "Flagged only" }, { value: "ok", label: "Within threshold" }]} aria-label="Flag filter" />
        <span className="text-xs text-slate">
          Threshold ±{db.settings.fuelVarianceThresholdPct}% (Settings). Variance = (invoice − GPS) ÷ GPS. Fuel-station side includes invoice and manual entries.
        </span>
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={!rows.length}
          onClick={() =>
            downloadCsv(
              "fuel-reconciliation",
              rows.map((r) => ({ Month: r.month, Vehicle: r.vehicleId, "GPS litres": r.gpsLitres, "Invoice litres": r.invoiceLitres, "Difference L": r.difference, "Variance %": r.variancePct, Flagged: r.flagged ? "Yes" : "No", "Review status": r.reviewStatus, "Review note": r.review?.note })),
            )
          }
        >
          <Download /> Export CSV
        </Button>
      </div>
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.key} initialSort={{ key: "month", dir: "desc" }} pageSize={10} rowClassName={(r) => (r.flagged && !r.review ? "bg-red-50/40" : undefined)} emptyTitle="No reconciliation rows" emptyDescription="Import GPS data and add fuel invoices to reconcile." />
      {reviewRow && <FuelReviewDialog row={reviewRow} onClose={() => setReviewRow(null)} />}
    </div>
  );
}

function FuelReviewDialog({ row, onClose }: { row: FuelReconRow; onClose: () => void }) {
  const actions = useFleetActions();
  const [status, setStatus] = useState<FuelReview["status"]>(row.review?.status ?? "Reviewed – Explained");
  const [note, setNote] = useState(row.review?.note ?? "");
  const needsNote = status !== "Pending Review";
  const err = needsNote && note.trim().length < 3 ? "Add a short note explaining the outcome" : "";
  const [touched, setTouched] = useState(false);

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`Review ${row.vehicleId} – ${formatMonth(row.month)}`}
      description="Stores a review status and note only. The original GPS and invoice records are never changed."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setTouched(true);
              if (err) return;
              if (actions.review(row.vehicleId, row.month, status, note)) onClose();
            }}
          >
            Save review
          </Button>
        </>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-3 rounded-lg border bg-muted/40 p-3 text-sm">
        <div><div className="text-xs text-slate">GPS litres</div><div className="font-semibold">{formatNumber(row.gpsLitres, 1)}</div></div>
        <div><div className="text-xs text-slate">Invoice litres</div><div className="font-semibold">{formatNumber(row.invoiceLitres, 1)}</div></div>
        <div><div className="text-xs text-slate">Variance</div><div className={cn("font-semibold", row.flagged && "text-danger")}>{row.variancePct === null ? "n/a" : `${row.variancePct > 0 ? "+" : ""}${row.variancePct.toFixed(1)}%`}</div></div>
        <div className="col-span-3 text-xs text-slate">{row.flagReason}</div>
      </div>
      <div className="space-y-3">
        <Field label="Review status">
          <NativeSelect value={status} onValueChange={(v) => setStatus(v as FuelReview["status"])} options={FUEL_REVIEW_STATUSES} />
        </Field>
        <Field label="Review note" required={needsNote} error={touched ? err : undefined}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Extra fill-up at depot not captured by GPS; confirmed with driver." />
        </Field>
      </div>
    </FormDialog>
  );
}
