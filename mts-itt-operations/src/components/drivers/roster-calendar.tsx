"use client";

import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { UserCheck } from "lucide-react";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useDriverActions } from "@/hooks/use-drivers";
import { rosterConflicts } from "@/lib/mutations/driver";
import { SHIFT_HOURS, WORK_SHIFTS, isWorkShift, type WorkShift } from "@/lib/roster-rules";
import { AssignDriverDialog, type AssignTarget } from "./assign-driver-dialog";
import { realToday, eachDay, addDays, formatDay, formatDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import type { AttendanceStatus, Driver, RosterEntry, RosterShift } from "@/types/driver";

const SHIFT_STYLE: Record<RosterShift, string> = {
  Morning: "bg-sky-50 text-sky-800 ring-sky-600/20",
  Afternoon: "bg-orange-50 text-orange-800 ring-orange-600/20",
  Night: "bg-slate-800 text-white ring-slate-900/30",
  Off: "bg-slate-50 text-slate-400 ring-slate-300/50",
  Leave: "bg-amber-50 text-amber-800 ring-amber-600/20",
};
const SHIFT_LABEL: Record<RosterShift, string> = { Morning: "Morning", Afternoon: "Afternoon", Night: "Night", Off: "Off", Leave: "Leave" };
const ATT_DOT: Record<AttendanceStatus, string> = { Present: "bg-emerald-500", Late: "bg-amber-500", Absent: "bg-red-500", Scheduled: "bg-transparent" };

export const isWorkingShift = (s: RosterShift) => isWorkShift(s);

export function RosterCalendar({
  start,
  days = 14,
  drivers,
  roster,
  showCoverage,
  onCellClick,
}: {
  start: string;
  days?: number;
  drivers: Driver[];
  roster: RosterEntry[];
  showCoverage?: boolean;
  onCellClick?: (driver: Driver, date: string, entry: RosterEntry | undefined) => void;
}) {
  const today = realToday();
  const dates = useMemo(() => eachDay(start, addDays(start, days - 1)), [start, days]);
  const cell = useMemo(() => new Map(roster.map((r) => [`${r.driverId}|${r.date}`, r])), [roster]);
  const conflicts = useMemo(() => rosterConflicts(roster), [roster]);

  const coverage = useMemo(
    () =>
      dates.map((date) => {
        const rows = roster.filter((r) => r.date === date && isWorkingShift(r.shift));
        const of = (shift: RosterShift) => {
          const list = rows.filter((r) => r.shift === shift);
          const absent = list.filter((r) => r.attendance === "Absent").length;
          return { drivers: list.length - absent, absent, movers: new Set(list.filter((r) => r.attendance !== "Absent" && r.primeMoverId).map((r) => r.primeMoverId)).size };
        };
        return { date, Morning: of("Morning"), Afternoon: of("Afternoon"), Night: of("Night") };
      }),
    [dates, roster],
  );

  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 min-w-44 border-b bg-muted px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate">Driver</th>
            {dates.map((date) => (
              <th key={date} className={cn("min-w-[5rem] border-b bg-muted px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate", date === today && "bg-brand/10 text-brand")}>
                <div>{formatDay(date, "EEE")}</div>
                <div className="text-xs normal-case tracking-normal">{formatDay(date, "dd MMM")}</div>
              </th>
            ))}
          </tr>
          {showCoverage && (
            <tr>
              <th className="sticky left-0 z-20 border-b bg-card px-3 py-1.5 text-left text-xs font-medium text-ink">Drivers on duty</th>
              {coverage.map((c) => {
                const total = c.Morning.drivers + c.Afternoon.drivers + c.Night.drivers;
                const gap = WORK_SHIFTS.some((k) => c[k].drivers === 0);
                return (
                  <td
                    key={c.date}
                    title={`Morning ${c.Morning.drivers} · Afternoon ${c.Afternoon.drivers} · Night ${c.Night.drivers}${gap ? " – a shift has no driver" : ""}`}
                    className={cn("border-b px-1 py-1 text-center", gap && "bg-red-50", c.date === today && !gap && "bg-brand/5")}
                  >
                    <div className={cn("text-sm font-semibold tabular-nums", gap ? "text-danger" : "text-ink")}>{total}</div>
                  </td>
                );
              })}
            </tr>
          )}
        </thead>
        <tbody>
          {drivers.map((drv) => (
            <tr key={drv.id} className="group">
              <td className="sticky left-0 z-10 border-b bg-card px-3 py-1.5 group-hover:bg-muted/60">
                <div className="truncate font-medium text-ink">{drv.name}</div>
                <div className="text-[11px] text-slate">
                  {drv.id} · {drv.shift}
                </div>
              </td>
              {dates.map((date) => {
                const e = cell.get(`${drv.id}|${date}`);
                const clash = conflicts.get(`${drv.id}|${date}`);
                const clickable = !!onCellClick;
                return (
                  <td key={date} className={cn("border-b p-0.5 text-center", date === today && "bg-brand/5")}>
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => onCellClick?.(drv, date, e)}
                      title={clash ? `Prime mover ${e?.primeMoverId} is also rostered for ${clash.join(", ")} on this shift` : e ? `${SHIFT_LABEL[e.shift]}${isWorkShift(e.shift) ? ` (${SHIFT_HOURS[e.shift].range})` : ""}${e.primeMoverId ? ` · ${e.primeMoverId}` : ""} · ${e.attendance}` : "Not rostered"}
                      className={cn(
                        "relative flex h-12 w-full flex-col items-center justify-center rounded-md ring-1 ring-inset transition",
                        e ? SHIFT_STYLE[e.shift] : "bg-transparent text-slate-300 ring-dashed ring-slate-200",
                        clickable && "hover:ring-2 hover:ring-brand",
                        clash && "ring-2 ring-red-500",
                      )}
                    >
                      <span className="text-[11px] font-semibold leading-none">{e ? SHIFT_LABEL[e.shift] : "—"}</span>
                      {e && isWorkingShift(e.shift) && (
                        <span className="mt-0.5 text-[10px] leading-none opacity-80">{e.coveredBy ? `→ ${e.coveredBy}` : e.coveringFor ? `for ${e.coveringFor}` : (e.primeMoverId ?? "no PM")}</span>
                      )}
                      {e && isWorkingShift(e.shift) && e.attendance !== "Scheduled" && <span className={cn("absolute right-1 top-1 size-1.5 rounded-full", ATT_DOT[e.attendance])} />}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface CellValues {
  shift: RosterShift;
  primeMoverId: string;
  attendance: AttendanceStatus;
}

/** Edit a single roster cell (shift, prime mover, attendance) – creates the cell if it does not exist yet. */
export function RosterCellDialog({ driver, date, entry, onClose }: { driver: Driver; date: string; entry?: RosterEntry; onClose: () => void }) {
  const { db } = useApp();
  const { can } = useAuth();
  const actions = useDriverActions();
  const canEdit = can("roster.edit");
  const canAttend = can("roster.attendance");
  const { control, handleSubmit } = useForm<CellValues>({
    defaultValues: { shift: entry?.shift ?? "Off", primeMoverId: entry?.primeMoverId ?? "", attendance: entry?.attendance ?? "Scheduled" },
  });
  const shift = useWatch({ control, name: "shift" });
  const pmId = useWatch({ control, name: "primeMoverId" });
  const working = isWorkingShift(shift);
  const [assign, setAssign] = useState<AssignTarget | null>(null);
  const canReplace = canEdit && !!entry && isWorkShift(entry.shift) && !entry.coveredBy;

  const sameShiftUsers = useMemo(
    () => db.roster.filter((r) => r.date === date && r.shift === shift && r.primeMoverId === pmId && pmId && r.driverId !== driver.id).map((r) => r.driverId),
    [db.roster, date, shift, pmId, driver.id],
  );

  const submit = handleSubmit((v) => {
    const patch: { shift?: RosterShift; primeMoverId?: string | null; attendance?: AttendanceStatus } = {};
    if (canEdit) {
      patch.shift = v.shift;
      if (isWorkingShift(v.shift)) patch.primeMoverId = v.primeMoverId || null;
    }
    if (canAttend && isWorkingShift(v.shift)) patch.attendance = v.attendance;
    actions.updateCell(driver.id, date, patch);
    onClose();
  });

  return (
    <>
    {assign && <AssignDriverDialog target={assign} onClose={() => { setAssign(null); onClose(); }} />}
    <FormDialog
      open={!assign}
      onOpenChange={(o) => !o && onClose()}
      title={`${driver.name} – ${formatDate(date)}`}
      description={`${driver.id} · ${formatDay(date, "EEEE")}${entry ? "" : " · no roster entry yet (saving creates one)"}`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="roster-cell-form" disabled={!canEdit && !canAttend}>
            Save
          </Button>
        </>
      }
    >
      <form id="roster-cell-form" onSubmit={submit} className="space-y-3">
        <Field label="Shift">
          <Controller control={control} name="shift" render={({ field }) => <NativeSelect disabled={!canEdit} value={field.value} onValueChange={field.onChange} options={[{ value: "Morning", label: `Morning (${SHIFT_HOURS.Morning.range})` }, { value: "Afternoon", label: `Afternoon (${SHIFT_HOURS.Afternoon.range})` }, { value: "Night", label: `Night (${SHIFT_HOURS.Night.range}, next day)` }, "Off", "Leave"]} />} />
        </Field>
        {working && (
          <>
            <Field label="Prime mover" hint={driver.primeMoverId ? `${driver.name} drives only his assigned truck (${driver.primeMoverId}).` : "Relief driver: covers the truck of the driver he replaces."}>
              <Controller
                control={control}
                name="primeMoverId"
                render={({ field }) => (
                  <NativeSelect
                    disabled={!canEdit}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="No prime mover"
                    options={db.primeMovers.filter((p) => !driver.primeMoverId || entry?.coveringFor || p.id === driver.primeMoverId).map((p) => ({ value: p.id, label: `${p.id} · ${p.regNo}${p.status !== "Active" ? ` – ${p.status}` : ""}` }))}
                  />
                )}
              />
            </Field>
            {sameShiftUsers.length > 0 && (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {pmId} is also rostered for {sameShiftUsers.join(", ")} on this {shift.toLowerCase()} shift.
              </p>
            )}
            <Field label="Attendance">
              <Controller control={control} name="attendance" render={({ field }) => <NativeSelect disabled={!canAttend} value={field.value} onValueChange={field.onChange} options={["Scheduled", "Present", "Late", "Absent"]} />} />
            </Field>
          </>
        )}
        {canReplace && entry && isWorkShift(entry.shift) && (
          <div className="rounded-md border bg-muted/40 p-3">
            <div className="text-xs text-slate">Driver not coming? Pick another driver who is free for this shift.</div>
            <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setAssign({ date, shift: entry.shift as WorkShift, primeMoverId: entry.primeMoverId, fromDriverId: driver.id })}>
              <UserCheck /> Replace driver
            </Button>
          </div>
        )}
        {entry?.coveredBy && <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">This shift is covered by {entry.coveredBy}.</p>}
        {entry?.coveringFor && <p className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">Covering this shift for {entry.coveringFor}.</p>}
        {!working && shift === "Leave" && <p className="text-xs text-slate">Use Leave management for formal leave requests; this sets only this day.</p>}
      </form>
    </FormDialog>
    </>
  );
}
