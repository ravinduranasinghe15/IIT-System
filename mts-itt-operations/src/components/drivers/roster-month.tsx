"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { addDays, formatDay, realToday } from "@/lib/date-utils";
import { SHIFT_HOURS, WORK_SHIFTS, isWorkShift, type WorkShift } from "@/lib/roster-rules";
import { StatusBadge } from "@/components/shared/status-badge";
import type { Driver, RosterEntry } from "@/types/driver";

const CHIP: Record<WorkShift, { letter: string; cls: string }> = {
  Morning: { letter: "M", cls: "bg-sky-100 text-sky-800" },
  Night: { letter: "N", cls: "bg-slate-800 text-white" },
};
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** First day of the month (yyyy-MM-01) for any yyyy-MM-dd date. */
export const monthStart = (date: string) => `${date.slice(0, 7)}-01`;

export function addMonths(monthFirst: string, n: number): string {
  const d = new Date(`${monthFirst}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n, 1);
  return d.toISOString().slice(0, 10);
}

/** Monday-first grid of dates covering the month (whole weeks). */
function monthGrid(monthFirst: string): string[] {
  const dow = (new Date(`${monthFirst}T00:00:00Z`).getUTCDay() + 6) % 7; // Mon=0
  const first = addDays(monthFirst, -dow);
  const next = addMonths(monthFirst, 1);
  const days: string[] = [];
  for (let d = first; d < next || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);
  return days;
}

export function RosterMonth({
  month,
  selected,
  onSelect,
  drivers,
  roster,
  onDriverClick,
}: {
  month: string;
  selected: string;
  onSelect: (date: string) => void;
  drivers: Driver[];
  roster: RosterEntry[];
  onDriverClick?: (driver: Driver, date: string, entry: RosterEntry | undefined) => void;
}) {
  const today = realToday();
  const days = useMemo(() => monthGrid(month), [month]);
  const byDate = useMemo(() => {
    const m = new Map<string, RosterEntry[]>();
    for (const r of roster) {
      const list = m.get(r.date) ?? [];
      list.push(r);
      m.set(r.date, list);
    }
    return m;
  }, [roster]);
  const driverOf = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);

  const dayRows = (byDate.get(selected) ?? []).filter((r) => driverOf.has(r.driverId));
  const offRows = dayRows.filter((r) => !isWorkShift(r.shift));

  return (
    <div>
      <div className="grid grid-cols-7 border-b bg-muted text-center text-[11px] font-semibold uppercase tracking-wide text-slate">
        {WEEKDAYS.map((w) => (
          <div key={w} className="px-1 py-2">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((date) => {
          const inMonth = date.slice(0, 7) === month.slice(0, 7);
          const rows = (byDate.get(date) ?? []).filter((r) => driverOf.has(r.driverId));
          const leave = rows.filter((r) => r.shift === "Leave").length;
          return (
            <button
              key={date}
              type="button"
              onClick={() => onSelect(date)}
              aria-label={`Roster for ${date}`}
              className={cn(
                "flex min-h-20 flex-col items-stretch gap-1 border-b border-r p-1.5 text-left transition hover:bg-muted/60",
                !inMonth && "bg-muted/30 text-slate-400",
                date === today && "bg-brand/5",
                date === selected && "ring-2 ring-inset ring-brand",
              )}
            >
              <span className={cn("text-xs font-semibold", date === today ? "text-brand" : inMonth ? "text-ink" : "text-slate-400")}>{Number(date.slice(8, 10))}</span>
              <span className="flex flex-wrap gap-0.5">
                {WORK_SHIFTS.map((s) => {
                  const n = rows.filter((r) => r.shift === s && r.attendance !== "Absent").length;
                  return n ? (
                    <span key={s} title={`${s}: ${n} driver(s)`} className={cn("rounded px-1 text-[10px] font-semibold leading-4", CHIP[s].cls)}>
                      {CHIP[s].letter} {n}
                    </span>
                  ) : null;
                })}
                {leave > 0 && <span title={`${leave} on leave`} className="rounded bg-amber-100 px-1 text-[10px] font-semibold leading-4 text-amber-800">L {leave}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-[11px] text-slate">
        <span><span className={cn("mr-1 rounded px-1 font-semibold", CHIP.Morning.cls)}>M</span>Morning</span>
        <span><span className={cn("mr-1 rounded px-1 font-semibold", CHIP.Night.cls)}>N</span>Night</span>
        <span><span className="mr-1 rounded bg-amber-100 px-1 font-semibold text-amber-800">L</span>On leave</span>
        <span>Number = drivers on that shift (absent excluded). Click a day for the drivers.</span>
      </div>

      <div className="border-t p-4">
        <div className="mb-3 text-sm font-semibold text-navy">{formatDay(selected, "EEEE, dd MMMM yyyy")}</div>
        {dayRows.length === 0 ? (
          <div className="text-sm text-slate">Nobody is rostered on this day.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {WORK_SHIFTS.map((s) => {
              const list = dayRows.filter((r) => r.shift === s);
              return (
                <div key={s} className="rounded-lg border">
                  <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs">
                    <span className="font-semibold text-ink">{s}</span>
                    <span className="text-slate">{SHIFT_HOURS[s].range} · {list.length}</span>
                  </div>
                  {list.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-danger">No driver rostered</div>
                  ) : (
                    <ul className="divide-y">
                      {list.map((r) => {
                        const drv = driverOf.get(r.driverId)!;
                        return (
                          <li key={r.id}>
                            <button
                              type="button"
                              disabled={!onDriverClick}
                              onClick={() => onDriverClick?.(drv, r.date, r)}
                              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs enabled:hover:bg-muted/60"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-ink">{drv.name}</span>
                                <span className="text-slate">
                                  {r.primeMoverId ?? "No truck"}
                                  {r.coveredBy ? ` · covered by ${r.coveredBy}` : r.coveringFor ? ` · covering ${r.coveringFor}` : ""}
                                </span>
                                {r.absentReason && <span className="block text-danger">Absent: {r.absentReason}</span>}
                              </span>
                              {r.attendance !== "Scheduled" && <StatusBadge status={r.attendance} />}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {offRows.length > 0 && (
          <div className="mt-3 text-xs text-slate">
            <span className="font-medium text-ink">Off / leave:</span>{" "}
            {offRows.map((r) => `${driverOf.get(r.driverId)!.name} (${r.shift})`).join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
