"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, CalendarDays, Check, ChevronLeft, ChevronRight, Moon, Sun, Sunset, UserCheck, UserRoundCheck, UserRoundX, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { addDays, realToday, eachDay, formatDay } from "@/lib/date-utils";
import type { Driver, RosterEntry } from "@/types/driver";
import { RosterCalendar, RosterCellDialog, isWorkingShift } from "./roster-calendar";
import { RosterMonth, addMonths, monthStart } from "./roster-month";
import { AttendanceDialog } from "./attendance-dialog";
import { LeavePanel, LeaveRequestDialog } from "./leave-dialogs";
import { AssignDriverDialog, type AssignTarget } from "./assign-driver-dialog";
import { Rows3 } from "lucide-react";
import { SHIFT_HOURS, checkRosterRules, type WorkShift } from "@/lib/roster-rules";
import { StatusBadge } from "@/components/shared/status-badge";

export function RosterView() {
  const { db } = useApp();
  const { can, isDriver, driverId } = useAuth();
  const today = realToday();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 6));
  const [pickDates, setPickDates] = useState(false);
  const [view, setView] = useState<"grid" | "calendar">("grid");
  const [month, setMonth] = useState(monthStart(today));
  const [selDate, setSelDate] = useState(today);
  const [showRules, setShowRules] = useState(false);
  const [q, setQ] = useState("");
  const [cell, setCell] = useState<{ driver: Driver; date: string; entry?: RosterEntry } | null>(null);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [assign, setAssign] = useState<AssignTarget | null>(null);

  const canEdit = can("roster.edit");
  const canAttend = can("roster.attendance");
  const span = eachDay(start, end).length;
  const MAX_DAYS = 31;
  const setRange = (from: string, to: string) => {
    if (!from || !to) return;
    const f = from;
    let t = to;
    if (t < f) t = f;
    if (eachDay(f, t).length > MAX_DAYS) t = addDays(f, MAX_DAYS - 1);
    setStart(f);
    setEnd(t);
  };
  const shift = (dir: 1 | -1) => setRange(addDays(start, dir * span), addDays(end, dir * span));
  const isDefaultRange = start === today && end === addDays(today, span - 1);

  const drivers = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.drivers.filter((d) => {
      if (isDriver) return d.id === driverId;
      if (d.status === "Inactive") return false;
      return !s || d.name.toLowerCase().includes(s) || d.id.toLowerCase().includes(s);
    });
  }, [db.drivers, isDriver, driverId, q]);
  const roster = useMemo(() => db.roster.filter((r) => drivers.some((d) => d.id === r.driverId)), [db.roster, drivers]);

  const todayRows = db.roster.filter((r) => r.date === today && isWorkingShift(r.shift));
  const morningToday = todayRows.filter((r) => r.shift === "Morning" && r.attendance !== "Absent").length;
  const afternoonToday = todayRows.filter((r) => r.shift === "Afternoon" && r.attendance !== "Absent").length;
  const nightToday = todayRows.filter((r) => r.shift === "Night" && r.attendance !== "Absent").length;
  const absentToday = todayRows.filter((r) => r.attendance === "Absent").length;
  const pendingLeave = db.leaves.filter((l) => l.status === "Pending").length;

  const ruleChecks = useMemo(() => checkRosterRules(drivers, db.roster, start, end), [drivers, db.roster, start, end]);
  const openShifts = [...db.openShifts].sort((a, b) => (a.date < b.date ? -1 : 1));

  const myDays = isDriver && driverId ? db.roster.filter((r) => r.driverId === driverId && r.date >= today && r.date <= addDays(today, 13)).sort((a, b) => (a.date < b.date ? -1 : 1)) : [];

  const own = isDriver && driverId ? db.drivers.find((d) => d.id === driverId) : null;

  if (isDriver) {
    return (
      <div>
        <PageHeader
          title="My roster"
          description={`Your shifts and trucks for the next 14 days${own ? ` (${own.name})` : ""}.`}
          actions={<Button onClick={() => setLeaveOpen(true)}>Request leave</Button>}
        />
        <SectionCard title="My shifts" description="Morning 7:00 AM – 3:00 PM · Afternoon 3:00 PM – 11:00 PM · Night 11:00 PM – 7:00 AM" bodyClassName="p-0">
          {myDays.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate">No shifts are rostered for the next 14 days.</div>
          ) : (
            <ul className="divide-y">
              {myDays.map((r) => {
                const work = isWorkingShift(r.shift);
                return (
                  <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="w-14 shrink-0 text-center">
                      <div className="text-[11px] font-semibold uppercase text-slate">{formatDay(r.date, "EEE")}</div>
                      <div className="text-lg font-semibold leading-tight text-ink">{formatDay(r.date, "dd")}</div>
                      <div className="text-[11px] text-slate">{formatDay(r.date, "MMM")}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={work ? "font-semibold text-ink" : "text-slate"}>{r.shift}</span>
                        {r.date === today && <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-semibold text-brand">Today</span>}
                      </div>
                      {work ? (
                        <div className="text-xs text-slate">
                          {SHIFT_HOURS[r.shift as WorkShift].range} · {r.primeMoverId ?? "No truck"}
                          {r.coveringFor ? " · covering another driver" : ""}
                        </div>
                      ) : (
                        <div className="text-xs text-slate">{r.shift === "Leave" ? "On leave" : "Day off"}</div>
                      )}
                    </div>
                    {work && r.date <= today && r.attendance !== "Scheduled" && <StatusBadge status={r.attendance} />}
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
        <div className="mt-4">
          <LeavePanel driverId={driverId} onRequest={() => setLeaveOpen(true)} />
        </div>
        {leaveOpen && <LeaveRequestDialog open onOpenChange={setLeaveOpen} fixedDriverId={driverId} />}
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={isDriver ? "My roster" : "Driver roster"}
        description={
          isDriver
            ? `Your shifts and prime-mover assignments${own ? ` (${own.name})` : ""}.`
            : "Who works which shift, and on which truck."
        }
        actions={
          <>
            {canAttend && (
              <Button variant="outline" onClick={() => setAttendanceOpen(true)}>
                <CalendarCheck /> Record attendance
              </Button>
            )}
            <Button onClick={() => setLeaveOpen(true)}>Request leave</Button>
          </>
        }
      />

      {/* Today at a glance + what the shifts mean */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {([
          { k: "Morning", n: morningToday, icon: Sun, cls: "bg-sky-50 text-sky-900 ring-sky-200" },
          { k: "Afternoon", n: afternoonToday, icon: Sunset, cls: "bg-orange-50 text-orange-900 ring-orange-200" },
          { k: "Night", n: nightToday, icon: Moon, cls: "bg-slate-800 text-white ring-slate-900/30" },
        ] as const).map(({ k, n, icon: Icon, cls }) => (
          <div key={k} className={`flex items-center gap-3 rounded-xl p-3 ring-1 ring-inset ${cls}`}>
            <Icon className="size-5 shrink-0" />
            <div className="min-w-0">
              <div className="text-2xl font-semibold leading-none tabular-nums">{n}</div>
              <div className="mt-1 text-xs font-medium">{k} · {SHIFT_HOURS[k].range}</div>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-inset ring-border">
          <UserRoundX className={`size-5 shrink-0 ${absentToday ? "text-danger" : "text-slate"}`} />
          <div>
            <div className="text-2xl font-semibold leading-none tabular-nums text-ink">{absentToday}</div>
            <div className="mt-1 text-xs text-slate">Absent today</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-inset ring-border">
          <UserRoundCheck className={`size-5 shrink-0 ${pendingLeave ? "text-warning" : "text-slate"}`} />
          <div>
            <div className="text-2xl font-semibold leading-none tabular-nums text-ink">{pendingLeave}</div>
            <div className="mt-1 text-xs text-slate">Leave requests waiting</div>
          </div>
        </div>
      </div>

      {canEdit && openShifts.length > 0 && (
        <SectionCard title={`Open shifts (${openShifts.length})`} description="These shifts lost their driver because of approved leave. Pick a free driver for each." bodyClassName="p-0" className="mb-4 border-amber-300">
          <ul className="divide-y">
            {openShifts.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">{formatDay(o.date, "EEE dd MMM")} · {o.shift} ({SHIFT_HOURS[o.shift].range})</div>
                  <div className="text-xs text-slate">{o.primeMoverId ?? "No truck"} · {o.reason}</div>
                </div>
                <Button size="sm" onClick={() => setAssign({ date: o.date, shift: o.shift, primeMoverId: o.primeMoverId, openShiftId: o.id, reason: o.reason })}>
                  <UserCheck /> Assign driver
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title={view === "calendar" ? formatDay(month, "MMMM yyyy") : `${formatDay(start, "dd MMM")} – ${formatDay(end, "dd MMM yyyy")}`}
        description={canEdit || canAttend ? "Click a cell to change the shift, record attendance or replace a driver." : "Read-only view."}
        bodyClassName="p-0"
        actions={
          <>
            <SearchInput value={q} onChange={setQ} placeholder="Find driver…" className="hidden w-40 sm:block" />
            <div className="flex overflow-hidden rounded-lg border text-xs">
              {([["grid", "Grid", Rows3], ["calendar", "Calendar", CalendarDays]] as const).map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setView(k)}
                  aria-pressed={view === k}
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 font-medium ${view === k ? "bg-navy text-white" : "bg-card text-slate hover:bg-muted"}`}
                >
                  <Icon className="size-3.5" /> {label}
                </button>
              ))}
            </div>
            {view === "calendar" ? (
              <>
                <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
                  <ChevronLeft />
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setMonth(monthStart(today)); setSelDate(today); }}>
                  Today
                </Button>
                <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
                  <ChevronRight />
                </Button>
              </>
            ) : (
              <>
            <div className="flex overflow-hidden rounded-lg border text-xs">
              {[7, 14].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setRange(start, addDays(start, d - 1))}
                  className={`px-2.5 py-1.5 font-medium ${span === d ? "bg-navy text-white" : "bg-card text-slate hover:bg-muted"}`}
                >
                  {d} days
                </button>
              ))}
            </div>
            <Button variant="outline" size="icon-sm" aria-label="Previous period" onClick={() => shift(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRange(today, addDays(today, span - 1))} disabled={isDefaultRange}>
              Today
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next period" onClick={() => shift(1)}>
              <ChevronRight />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPickDates((v) => !v)}>
              Pick dates
            </Button>
              </>
            )}
          </>
        }
      >
        {view === "grid" && pickDates && (
          <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-sm">
            <label className="flex items-center gap-2 text-slate">
              From
              <Input type="date" value={start} onChange={(e) => setRange(e.target.value, end < e.target.value ? e.target.value : end)} className="h-8 w-40" aria-label="Roster from date" />
            </label>
            <label className="flex items-center gap-2 text-slate">
              To
              <Input type="date" value={end} min={start} onChange={(e) => setRange(start, e.target.value)} className="h-8 w-40" aria-label="Roster to date" />
            </label>
            <span className="text-xs text-slate">Up to {MAX_DAYS} days.</span>
          </div>
        )}
        {drivers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate">No drivers match.</div>
        ) : view === "calendar" ? (
          <RosterMonth
            month={month}
            selected={selDate}
            onSelect={(d) => {
              setSelDate(d);
              if (d.slice(0, 7) !== month.slice(0, 7)) setMonth(monthStart(d));
            }}
            drivers={drivers}
            roster={roster}
            onDriverClick={canEdit || canAttend ? (driver, date, entry) => setCell({ driver, date, entry }) : undefined}
          />
        ) : (
          <RosterCalendar
            start={start}
            days={span}
            drivers={drivers}
            roster={roster}
            showCoverage
            onCellClick={canEdit || canAttend ? (driver, date, entry) => setCell({ driver, date, entry }) : undefined}
          />
        )}
        {view === "grid" && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-[11px] text-slate">
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" />Present</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" />Late</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-red-500" />Absent</span>
          <span>&ldquo;→ DR-xxx&rdquo; = another driver took the shift</span>
          <span>Red outline = truck double-booked</span>
        </div>}
      </SectionCard>

      {/* Rules: one line when everything is fine */}
      {(() => {
        const failed = ruleChecks.filter((c) => !c.passed);
        const open = showRules || failed.length > 0;
        return (
          <div className={`mt-4 rounded-xl border p-3 text-sm ${failed.length ? "border-red-200 bg-red-50/50" : "border-emerald-200 bg-emerald-50/50"}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={failed.length ? "text-danger" : "text-success"}>{failed.length ? <X className="size-4" /> : <Check className="size-4" />}</span>
              <span className="font-medium text-ink">{failed.length ? `${failed.length} roster rule${failed.length === 1 ? "" : "s"} need attention` : "All roster rules are met for these dates"}</span>
              {failed.length === 0 && (
                <button type="button" className="ml-auto text-xs font-medium text-brand hover:underline" onClick={() => setShowRules((v) => !v)}>
                  {showRules ? "Hide rules" : "Show rules"}
                </button>
              )}
            </div>
            {open && (
              <ul className="mt-2 space-y-1">
                {ruleChecks.map((c) => (
                  <li key={c.key} className="flex items-start gap-2 text-xs">
                    <span className={c.passed ? "mt-0.5 text-success" : "mt-0.5 text-danger"}>{c.passed ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>
                    <div className="min-w-0 text-slate">
                      <span className="text-ink">{c.label}</span>
                      {c.problems.length > 0 && <div className="text-danger">{c.problems.slice(0, 4).join(" · ")}{c.problems.length > 4 ? ` · +${c.problems.length - 4} more` : ""}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })()}

      <div className="mt-4">
        <LeavePanel driverId={isDriver ? driverId : undefined} onRequest={() => setLeaveOpen(true)} />
      </div>

      {cell && <RosterCellDialog driver={cell.driver} date={cell.date} entry={db.roster.find((r) => r.driverId === cell.driver.id && r.date === cell.date)} onClose={() => setCell(null)} />}
      {assign && <AssignDriverDialog target={assign} onClose={() => setAssign(null)} />}
      {attendanceOpen && <AttendanceDialog open onOpenChange={setAttendanceOpen} />}
      {leaveOpen && <LeaveRequestDialog open onOpenChange={setLeaveOpen} fixedDriverId={isDriver ? driverId : undefined} />}
    </div>
  );
}
