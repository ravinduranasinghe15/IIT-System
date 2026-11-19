"use client";

import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { Moon, Plane, Sun, UserCheck } from "lucide-react";
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
  Morning: "bg-amber-50 text-amber-900 ring-amber-200 hover:bg-amber-100/70",
  Night: "bg-indigo-50 text-indigo-900 ring-indigo-200 hover:bg-indigo-100/70",
  Off: "bg-transparent text-slate-400 ring-transparent hover:bg-slate-100",
  Leave: "bg-violet-50 text-violet-800 ring-violet-200 hover:bg-violet-100/70",
};
const SHIFT_LABEL: Record<RosterShift, string> = { Morning: "Morning", Night: "Night", Off: "Off", Leave: "Leave" };
const SHIFT_ICON: Partial<Record<RosterShift, typeof Sun>> = { Morning: Sun, Night: Moon, Leave: Plane };
const ATT_DOT: Record<AttendanceStatus, string> = { Present: "bg-emerald-500", Late: "bg-amber-500", Absent: "bg-red-500", Scheduled: "bg-transparent" };

export const isWorkingShift = (s: RosterShift) => isWorkShift(s);

const initials = (name: string) => name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const isWeekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());

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
        return { date, Morning: of("Morning"), Night: of("Night") };
      }),
    [dates, roster],
  );

  const colBg = (date: string) => (date === today ? "bg-brand/[0.06]" : isWeekend(date) ? "bg-slate-50/70" : "");

  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-20 min-w-52 border-b bg-card px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate">Driver</th>
            {dates.map((date) => (
              <th key={date} className={cn("min-w-[5.75rem] border-b px-1 py-2.5 text-center", colBg(date) || "bg-card")}>
                <div className={cn("text-[11px] font-semibold uppercase tracking-wide", date === today ? "text-brand" : "text-slate")}>{formatDay(date, "EEE")}</div>
                <div className={cn("mt-0.5 inline-flex min-w-8 items-center justify-center rounded-full px-1.5 text-sm font-semibold", date === today ? "bg-brand text-white" : "text-ink")}>{formatDay(date, "dd")}</div>
                <div className="text-[10px] font-normal text-slate">{formatDay(date, "MMM")}</div>
              </th>
            ))}
          </tr>
          {showCoverage && (
            <tr>
              <th className="sticky left-0 z-20 border-b bg-muted/60 px-4 py-2 text-left text-[11px] font-medium text-slate">
                Drivers on duty
                <span className="ml-1.5 inline-flex items-center gap-1 align-middle text-amber-600"><Sun className="size-3" /></span>
                <span className="inline-flex items-center gap-1 align-middle text-indigo-600"><Moon className="size-3" /></span>
              </th>
              {coverage.map((c) => {
                const gap = WORK_SHIFTS.some((k) => c[k].drivers === 0);
                return (
                  <td key={c.date} title={`Morning ${c.Morning.drivers} · Night ${c.Night.drivers}${gap ? " – a shift has no driver" : ""}`} className={cn("border-b bg-muted/60 px-1 py-1.5 text-center", gap && "bg-red-50")}>
                    <div className="flex items-center justify-center gap-2 text-[11px] font-semibold tabular-nums">
                      <span className={cn("inline-flex items-center gap-0.5", c.Morning.drivers === 0 ? "text-danger" : "text-amber-700")}>
                        <Sun className="size-3" />
                        {c.Morning.drivers}
                      </span>
                      <span className={cn("inline-flex items-center gap-0.5", c.Night.drivers === 0 ? "text-danger" : "text-indigo-700")}>
                        <Moon className="size-3" />
                        {c.Night.drivers}
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
          )}
        </thead>
        <tbody>
          {drivers.map((drv) => (
            <tr key={drv.id} className="group">
              <td className="sticky left-0 z-10 border-b bg-card px-4 py-1.5 transition group-hover:bg-muted/60">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-navy/10 text-[11px] font-semibold text-navy">{initials(drv.name)}</span>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-medium text-ink">{drv.name}</div>
                    <div className="text-[11px] text-slate">{drv.id}</div>
                  </div>
                </div>
              </td>
              {dates.map((date) => {
                const e = cell.get(`${drv.id}|${date}`);
                const clash = conflicts.get(`${drv.id}|${date}`);
                const clickable = !!onCellClick;
                const working = !!e && isWorkingShift(e.shift);
                const Icon = e ? SHIFT_ICON[e.shift] : undefined;
                const absent = working && e.attendance === "Absent";
                return (
                  <td key={date} className={cn("border-b p-1 text-center transition group-hover:bg-muted/40", colBg(date))}>
                    <button
                      type="button"
                      disabled={!clickable}
                      onClick={() => onCellClick?.(drv, date, e)}
                      title={clash ? `Prime mover ${e?.primeMoverId} is also rostered for ${clash.join(", ")} on this shift` : e ? `${SHIFT_LABEL[e.shift]}${isWorkShift(e.shift) ? ` (${SHIFT_HOURS[e.shift].range})` : ""}${e.primeMoverId ? ` · ${e.primeMoverId}` : ""} · ${e.attendance}${e.absentReason ? ` · ${e.absentReason}` : ""}` : "Not rostered"}
                      className={cn(
                        "relative flex h-12 w-full flex-col items-center justify-center gap-0.5 rounded-lg px-1 ring-1 ring-inset transition",
                        e ? SHIFT_STYLE[e.shift] : "bg-transparent text-slate-300 ring-transparent",
                        clickable && "hover:-translate-y-px hover:shadow-sm hover:ring-2 hover:ring-brand/50 focus-visible:ring-2 focus-visible:ring-brand",
                        absent && "bg-red-50 text-red-800 ring-red-200",
                        clash && "ring-2 ring-red-500",
                      )}
                    >
                      <span className={cn("flex items-center gap-1 text-[11px] font-semibold leading-none", absent && "line-through decoration-red-400")}>
                        {Icon && <Icon className="size-3" />}
                        {e ? SHIFT_LABEL[e.shift] : "—"}
                      </span>
                      {working && (
                        <span className="rounded bg-card/80 px-1 font-mono text-[10px] leading-4 text-ink/70 ring-1 ring-black/5">
                          {e.coveredBy ? `→ ${e.coveredBy}` : e.coveringFor ? `for ${e.coveringFor}` : (e.primeMoverId ?? "no truck")}
                        </span>
                      )}
                      {working && e.attendance !== "Scheduled" && <span className={cn("absolute right-1 top-1 size-1.5 rounded-full ring-2 ring-card", ATT_DOT[e.attendance])} />}
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
          <Controller control={control} name="shift" render={({ field }) => <NativeSelect disabled={!canEdit} value={field.value} onValueChange={field.onChange} options={[{ value: "Morning", label: `Morning (${SHIFT_HOURS.Morning.range})` }, { value: "Night", label: `Night (${SHIFT_HOURS.Night.range}, ends next day)` }, "Off", "Leave"]} />} />
        </Field>
        {working && (
          <>
            <Field label="Prime mover" hint="Any truck can be chosen; a truck has only one driver per shift.">
              <Controller
                control={control}
                name="primeMoverId"
                render={({ field }) => (
                  <NativeSelect
                    disabled={!canEdit}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder="No prime mover"
                    options={db.primeMovers.map((p) => ({ value: p.id, label: `${p.id} · ${p.regNo}${p.status !== "Active" ? ` – ${p.status}` : ""}` }))}
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
