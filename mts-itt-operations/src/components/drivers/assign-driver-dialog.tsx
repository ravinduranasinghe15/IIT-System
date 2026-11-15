"use client";

import { useMemo, useState } from "react";
import { UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { FormDialog } from "@/components/shared/form-dialog";
import { useApp } from "@/contexts/app-context";
import { useDriverActions } from "@/hooks/use-drivers";
import { formatDate, formatDay } from "@/lib/date-utils";
import { SHIFT_HOURS, availableDrivers, type WorkShift } from "@/lib/roster-rules";
import { cn } from "@/lib/utils";

export interface AssignTarget {
  date: string;
  shift: WorkShift;
  primeMoverId: string | null;
  /** Absent driver whose shift is being covered */
  fromDriverId?: string;
  /** Open shift (approved leave) being filled */
  openShiftId?: string;
  reason?: string;
}

/** Lists the drivers who are free for a shift (no shift that day, rested, not on leave) and assigns the one picked. */
export function AssignDriverDialog({ target, onClose }: { target: AssignTarget; onClose: () => void }) {
  const { db } = useApp();
  const actions = useDriverActions();
  const [picked, setPicked] = useState<string | null>(null);
  const list = useMemo(() => availableDrivers(db, target.date, target.shift, target.fromDriverId), [db, target.date, target.shift, target.fromDriverId]);
  const from = target.fromDriverId ? db.drivers.find((d) => d.id === target.fromDriverId) : null;

  const assign = () => {
    if (!picked) return;
    const ok = actions.replace({
      date: target.date,
      shift: target.shift,
      toDriverId: picked,
      primeMoverId: target.primeMoverId,
      fromDriverId: target.fromDriverId,
      openShiftId: target.openShiftId,
    });
    if (ok) onClose();
  };

  return (
    <FormDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Assign a driver"
      description={`${target.shift} shift (${SHIFT_HOURS[target.shift].range}) · ${formatDay(target.date, "EEEE")} ${formatDate(target.date)}${target.primeMoverId ? ` · ${target.primeMoverId}` : ""}`}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!picked} onClick={assign}>
            <UserCheck /> Assign driver
          </Button>
        </>
      }
    >
      {(from || target.reason) && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {from ? `${from.name} will not be attending this shift.` : target.reason}
        </p>
      )}
      <p className="mb-2 text-xs text-slate">
        Drivers who are free for this shift: no other shift that day, not on leave, and at least 8 hours since their last shift. Drivers marked &quot;Weekly off day&quot; are free today, but taking the shift uses their only day off this week.
      </p>
      {list.length === 0 ? (
        <EmptyState title="No driver is available" description="Everyone is either rostered, on leave or still resting at that time." />
      ) : (
        <div className="divide-y rounded-lg border">
          {list.map(({ driver, lastShift, recentTrucks, usesWeeklyOff }) => (
            <label key={driver.id} className={cn("flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50", picked === driver.id && "bg-brand/5")}>
              <input type="radio" name="replacement" className="size-4 accent-[var(--color-brand)]" checked={picked === driver.id} onChange={() => setPicked(driver.id)} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-ink">{driver.name}</div>
                <div className="text-xs text-slate">
                  {driver.id} · Last shift: {lastShift}
                  {recentTrucks.length > 0 && ` · Trucks: ${recentTrucks.join(", ")}`}
                </div>
              </div>
              {usesWeeklyOff ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20" title="This is their only day off this week">Weekly off day</span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">Free</span>
              )}
            </label>
          ))}
        </div>
      )}
    </FormDialog>
  );
}
