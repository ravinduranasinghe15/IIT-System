"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileSpreadsheet, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { FormDialog } from "@/components/shared/form-dialog";
import { useAuth } from "@/contexts/auth-context";
import { useFleetActions } from "@/hooks/use-fleet";
import { DEMO_FUEL_FILE_NAME, DEMO_FUEL_INVOICES } from "@/data/demo-fuel-invoices";
import type { FuelInvoiceImportResult } from "@/lib/mutations/fuel";
import { formatMoney, formatNumber, cn } from "@/lib/utils";
import { useApp } from "@/contexts/app-context";

const STAGES = ["Reading fuel-station invoices", "Matching each invoice to a vehicle", "Adding fuel-station records"];
const STAGE_MS = 600;

/** Demo: imports the prepared fuel-station invoice file (fixed rows) so reconciliation has both sides. */
export function FuelInvoiceImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { db } = useApp();
  const { canSeeFinancials } = useAuth();
  const actions = useFleetActions();
  const [name, setName] = useState<string | null>(null);
  const [phase, setPhase] = useState<"select" | "processing" | "results">("select");
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<FuelInvoiceImportResult | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  const run = () => {
    if (!name) return;
    setPhase("processing");
    setStage(0);
    STAGES.forEach((_, i) => i > 0 && timers.current.push(window.setTimeout(() => setStage(i), i * STAGE_MS)));
    timers.current.push(
      window.setTimeout(() => {
        const res = actions.importInvoices(name, DEMO_FUEL_INVOICES);
        if (res) {
          setResult(res);
          setPhase("results");
        } else {
          setPhase("select");
        }
      }, STAGES.length * STAGE_MS),
    );
  };

  const close = (o: boolean) => {
    if (!o && phase === "processing") return;
    onOpenChange(o);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title="Import fuel-station invoices"
      description="Fuel-station side of the reconciliation. The invoices are added as separate records; GPS data is never changed."
      footer={
        phase === "select" ? (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button disabled={!name} onClick={run}>Import invoices</Button>
          </>
        ) : phase === "results" ? (
          <Button onClick={() => onOpenChange(false)}>View reconciliation</Button>
        ) : undefined
      }
    >
      {phase === "select" &&
        (name ? (
          <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success">
              <FileSpreadsheet className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-ink">{name}</div>
              <div className="text-xs text-slate">Ready to import</div>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label="Remove file" onClick={() => setName(null)}>
              <X />
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <FileDropzone accept=".csv,.xlsx,.xls" onFiles={(f) => setName(f[0].name)} title="Drag & drop the fuel invoice file here" hint="CSV · XLSX" />
            <div className="text-center text-xs text-slate">
              or{" "}
              <button type="button" className="font-medium text-brand underline" onClick={() => setName(DEMO_FUEL_FILE_NAME)}>
                use the demo invoice file ({DEMO_FUEL_FILE_NAME})
              </button>
            </div>
          </div>
        ))}

      {phase === "processing" && (
        <ol className="space-y-3 py-2">
          {STAGES.map((label, i) => {
            const done = i < stage;
            const active = i === stage;
            return (
              <li key={label} className="flex items-center gap-3 text-sm">
                <span className={cn("flex size-6 items-center justify-center rounded-full", done ? "bg-success text-white" : active ? "bg-navy text-white" : "bg-muted text-slate")}>
                  {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : <span className="text-xs">{i + 1}</span>}
                </span>
                <span className={cn(active ? "font-semibold text-navy" : done ? "text-ink" : "text-slate")}>{label}</span>
              </li>
            );
          })}
        </ol>
      )}

      {phase === "results" && result && (
        <div className="space-y-3">
          <div className="text-sm font-medium text-emerald-700">{result.records} invoices imported from {result.fileName}.</div>
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <dt className="text-xs text-slate">Vehicles</dt>
              <dd className="text-lg font-semibold text-ink">{result.vehicles}</dd>
            </div>
            <div className="rounded-lg border p-3">
              <dt className="text-xs text-slate">Litres</dt>
              <dd className="text-lg font-semibold text-ink">{formatNumber(result.litres, 1)}</dd>
            </div>
            <div className="rounded-lg border p-3">
              <dt className="text-xs text-slate">Amount</dt>
              <dd className="text-lg font-semibold text-ink">{canSeeFinancials ? formatMoney(result.amount, db.settings.currency) : "—"}</dd>
            </div>
          </dl>
          <p className="text-xs text-slate">The Reconciliation tab now compares these litres with the GPS litres for each vehicle.</p>
        </div>
      )}
    </FormDialog>
  );
}
