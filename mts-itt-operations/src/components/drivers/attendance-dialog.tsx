"use client";

import { useMemo, useState } from "react";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field } from "@/components/shared/field";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/app-context";
import { useDriverActions } from "@/hooks/use-drivers";
import { realToday, formatDay } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { AttendanceStatus } from "@/types/driver";

const OPTIONS: { value: AttendanceStatus; className: string }[] = [
  { value: "Present", className: "data-[on=true]:bg-emerald-600 data-[on=true]:text-white" },
  { value: "Late", className: "data-[on=true]:bg-amber-500 data-[on=true]:text-white" },
  { value: "Absent", className: "data-[on=true]:bg-red-600 data-[on=true]:text-white" },
];

/** Day sheet: record Present / Late / Absent for every rostered driver on a date. */
export function AttendanceDialog({ open, onOpenChange, initialDate }: { open: boolean; onOpenChange: (o: boolean) => void; initialDate?: string }) {
  const { db } = useApp();
  const actions = useDriverActions();
  const [date, setDate] = useState(initialDate ?? realToday());

  const rows = useMemo(
    () =>
      db.roster
        .filter((r) => r.date === date && (r.shift === "Morning" || r.shift === "Night"))
        .sort((a, b) => a.shift.localeCompare(b.shift) || a.driverId.localeCompare(b.driverId)),
    [db.roster, date],
  );
  const future = date > realToday();

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record attendance"
      description="Mark each rostered driver Present, Late or Absent. Every change is audit-logged."
      size="lg"
      footer={<Button onClick={() => onOpenChange(false)}>Done</Button>}
    >
      <div className="mb-3 flex items-end gap-3">
        <Field label="Roster date" className="w-44">
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </Field>
        <div className="pb-1 text-sm text-slate">{formatDay(date, "EEEE, dd MMM yyyy")}</div>
      </div>
      {future && <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">This date is in the future – attendance is normally recorded on or after the shift day.</p>}
      {rows.length === 0 ? (
        <EmptyState title="No rostered drivers" description="No Morning or Night shifts are rostered on this date." />
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map((r) => {
            const drv = db.drivers.find((d) => d.id === r.driverId);
            return (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink">{drv?.name ?? r.driverId}</div>
                  <div className="text-xs text-slate">
                    {r.driverId} · {r.primeMoverId ?? "no prime mover"}
                  </div>
                </div>
                <StatusBadge status={r.shift} />
                <div className="flex overflow-hidden rounded-lg border">
                  {OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      data-on={r.attendance === o.value}
                      onClick={() => r.attendance !== o.value && actions.attendance(r.driverId, date, o.value)}
                      className={cn("border-r px-3 py-1 text-xs font-medium text-slate last:border-r-0 hover:bg-muted", o.className)}
                    >
                      {o.value}
                    </button>
                  ))}
                </div>
                <span className="w-16 text-right text-xs text-slate">{r.attendance === "Scheduled" ? "Not recorded" : ""}</span>
              </div>
            );
          })}
        </div>
      )}
    </FormDialog>
  );
}
