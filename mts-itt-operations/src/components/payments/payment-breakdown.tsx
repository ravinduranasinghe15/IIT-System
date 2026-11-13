"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/shared/form-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import { unitsFor } from "@/lib/eligibility";
import { formatDate, formatDateTime } from "@/lib/date-utils";
import { movementDay } from "@/lib/eligibility";
import { formatMoney } from "@/lib/utils";
import type { PayLine, UnitMode } from "@/types/payment";

/** Per-driver breakdown: every included movement (units × rate) and every excluded movement with its reason. */
export function PayBreakdownDialog({
  line,
  onClose,
  unitMode,
  rates,
  currency,
}: {
  line: PayLine | null;
  onClose: () => void;
  unitMode: UnitMode;
  rates: { "20FT": number; "40FT": number };
  currency: string;
}) {
  const { db } = useApp();
  const mv = (id: string) => db.movements.find((m) => m.id === id);
  const th = "px-2 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate";
  const td = "px-2 py-1.5 text-sm";

  return (
    <FormDialog
      open={!!line}
      onOpenChange={(o) => !o && onClose()}
      title={line ? `Pay breakdown – ${line.driverName}` : "Pay breakdown"}
      description={line ? `${line.driverId} · ${line.movementIds.length} included, ${line.excluded.length} excluded movements` : undefined}
      size="xl"
      footer={<Button variant="outline" onClick={onClose}>Close</Button>}
    >
      {line && (
        <div className="space-y-5">
          <div className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-slate">Eligible payable units</div><div className="font-semibold">{line.payableUnits}</div></div>
            <div><div className="text-xs text-slate">Base amount (units × rate)</div><div className="font-semibold">{formatMoney(line.baseAmount, currency)}</div></div>
            <div>
              <div className="text-xs text-slate">Adjustments</div>
              <div className="font-semibold">{formatMoney(line.adjustments, currency)}</div>
              {line.adjustmentNote && <div className="text-xs text-slate">{line.adjustmentNote}</div>}
            </div>
            <div><div className="text-xs text-slate">Total earnings</div><div className="font-semibold text-navy">{formatMoney(line.total, currency)}</div></div>
          </div>

          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-navy">Included movements</h3>
            <div className="scroll-thin overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[640px]">
                <thead className="bg-muted/60">
                  <tr>
                    <th className={th}>Movement</th><th className={th}>Container(s)</th><th className={th}>Size</th><th className={th}>Route</th>
                    <th className={th}>Op. day</th><th className={`${th} text-right`}>Units</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {line.movementIds.map((id) => {
                    const m = mv(id);
                    if (!m) return null;
                    const units = unitsFor(m, unitMode);
                    const rate = rates[m.containerSize];
                    return (
                      <tr key={id}>
                        <td className={td}><Link href={`/movements/${id}`} className="font-medium text-brand hover:underline">{id}</Link></td>
                        <td className={td}>{m.containerNos.join(" / ")}</td>
                        <td className={td}>{m.containerSize}</td>
                        <td className={td}>{m.sourceTerminal} → {m.destinationTerminal}</td>
                        <td className={td}>{formatDate(movementDay(m, db.settings.opDayStartHour))}</td>
                        <td className={`${td} text-right`}>{units}</td>
                        <td className={`${td} text-right`}>{formatMoney(rate, currency)}</td>
                        <td className={`${td} text-right font-medium`}>{formatMoney(units * rate, currency)}</td>
                      </tr>
                    );
                  })}
                  {!line.movementIds.length && (
                    <tr><td colSpan={8} className="px-2 py-6 text-center text-sm text-slate">No eligible movements for this driver in the period.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="mb-1.5 text-sm font-semibold text-navy">Excluded movements</h3>
            <div className="scroll-thin overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[560px]">
                <thead className="bg-muted/60">
                  <tr><th className={th}>Movement</th><th className={th}>Container(s)</th><th className={th}>Status</th><th className={th}>Loaded</th><th className={th}>Reason excluded</th></tr>
                </thead>
                <tbody className="divide-y">
                  {line.excluded.map((e) => {
                    const m = mv(e.movementId);
                    return (
                      <tr key={e.movementId}>
                        <td className={td}><Link href={`/movements/${e.movementId}`} className="font-medium text-brand hover:underline">{e.movementId}</Link></td>
                        <td className={td}>{m?.containerNos.join(" / ") ?? "—"}</td>
                        <td className={td}>{m ? <StatusBadge status={m.status} /> : "—"}</td>
                        <td className={td}>{formatDateTime(m?.loadingAt)}</td>
                        <td className={`${td} text-amber-700`}>{e.reason}</td>
                      </tr>
                    );
                  })}
                  {!line.excluded.length && (
                    <tr><td colSpan={5} className="px-2 py-6 text-center text-sm text-slate">No excluded movements.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-xs text-slate">Excluded movements never silently become payable – resolve the exception or approval, then regenerate the draft.</p>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
