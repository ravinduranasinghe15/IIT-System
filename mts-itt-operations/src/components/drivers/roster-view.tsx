"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, Check, ChevronLeft, ChevronRight, Info, Moon, Sun, Sunset, UserCheck, UserRoundCheck, UserRoundX, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect } from "@/components/shared/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { addDays, realToday, eachDay, formatDay } from "@/lib/date-utils";
import type { Driver, RosterEntry } from "@/types/driver";
import { RosterCalendar, RosterCellDialog, isWorkingShift } from "./roster-calendar";
import { AttendanceDialog } from "./attendance-dialog";
import { LeavePanel, LeaveRequestDialog } from "./leave-dialogs";
import { AssignDriverDialog, type AssignTarget } from "./assign-driver-dialog";
import { SHIFT_HOURS, checkRosterRules, type WorkShift } from "@/lib/roster-rules";
import { StatusBadge } from "@/components/shared/status-badge";

export function RosterView() {
  const { db } = useApp();
  const { can, isDriver, driverId } = useAuth();
  const today = realToday();
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(addDays(today, 13));
  const [q, setQ] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
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
  const isDefaultRange = start === today && end === addDays(today, 13);

  const drivers = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.drivers.filter((d) => {
      if (isDriver) return d.id === driverId;
      if (d.status === "Inactive") return false;
      if (shiftFilter && d.shift !== shiftFilter) return false;
      return !s || d.name.toLowerCase().includes(s) || d.id.toLowerCase().includes(s);
    });
  }, [db.drivers, isDriver, driverId, q, shiftFilter]);
  const roster = useMemo(() => db.roster.filter((r) => drivers.some((d) => d.id === r.driverId)), [db.roster, drivers]);

  const todayRows = db.roster.filter((r) => r.date === today && isWorkingShift(r.shift));
  const morningToday = todayRows.filter((r) => r.shift === "Morning" && r.attendance !== "Absent").length;
  const afternoonToday = todayRows.filter((r) => r.shift === "Afternoon" && r.attendance !== "Absent").length;
  const nightToday = todayRows.filter((r) => r.shift === "Night" && r.attendance !== "Absent").length;
  const absentToday = todayRows.filter((r) => r.attendance === "Absent").length;
  const pendingLeave = db.leaves.filter((l) => l.status === "Pending").length;
  const activeDrivers = db.drivers.filter((d) => d.status === "Active").length;
  const activePms = db.primeMovers.filter((p) => p.status === "Active").length;

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
            : "Shift calendar with a selectable date range and morning, afternoon and night cover for continuous 24-hour operation."
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

      {!isDriver && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard label="Morning shift today" value={morningToday} icon={Sun} tone="orange" hint={`${SHIFT_HOURS.Morning.range} · excl. absent`} />
            <StatCard label="Afternoon shift today" value={afternoonToday} icon={Sunset} tone="orange" hint={`${SHIFT_HOURS.Afternoon.range} · excl. absent`} />
            <StatCard label="Night shift today" value={nightToday} icon={Moon} tone="navy" hint={`${SHIFT_HOURS.Night.range} · excl. absent`} />
            <StatCard label="Absent today" value={absentToday} icon={UserRoundX} tone={absentToday ? "red" : "grey"} />
            <StatCard label="Pending leave requests" value={pendingLeave} icon={UserRoundCheck} tone={pendingLeave ? "orange" : "grey"} />
          </div>

          <div className="mb-4 flex gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            <Info className="mt-0.5 size-4 shrink-0" />
            <div>
              <div className="font-medium">Staffing rules need MTS confirmation</div>
              <p className="text-xs leading-relaxed">
                The proposal mentions 9 prime movers, 14 drivers and &quot;3 drivers per truck&quot;, but these are unconfirmed and are <strong>not enforced</strong> here. Assignments are fully editable and the
                configurable value is set in Settings (drivers per truck:{" "}
                <strong>{db.settings.driversPerTruck ?? "not set"}</strong>). Currently registered: {activeDrivers} active drivers, {activePms} active prime movers. Shift hours and roster rules below are demo defaults (to be confirmed with MTS).
              </p>
            </div>
          </div>
        </>
      )}

      <div className="mb-4 rounded-xl border bg-card p-3 shadow-sm">
        <div className="mb-2 text-xs font-medium text-ink">How the 24 hours are covered (one operational day, 7 AM → 7 AM) · three 8-hour shifts</div>
        <div className="flex overflow-hidden rounded-lg text-xs font-medium">
          <div className="flex flex-1 items-center justify-center gap-1.5 bg-sky-100 py-2 text-sky-900"><Sun className="size-3.5" /> Morning · {SHIFT_HOURS.Morning.range}</div>
          <div className="flex flex-1 items-center justify-center gap-1.5 bg-orange-100 py-2 text-orange-900"><Sunset className="size-3.5" /> Afternoon · {SHIFT_HOURS.Afternoon.range}</div>
          <div className="flex flex-1 items-center justify-center gap-1.5 bg-slate-800 py-2 text-white"><Moon className="size-3.5" /> Night · {SHIFT_HOURS.Night.range}</div>
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-slate"><span>7 AM</span><span>3 PM</span><span>11 PM</span><span>7 AM</span></div>
        <p className="mt-1 text-[11px] text-slate">A driver works one 8-hour shift a day, rests at least 8 hours between shifts, and has at least one day off every week. A night shift that starts on Monday finishes on Tuesday morning and counts as Monday.</p>
      </div>

      {!isDriver && canEdit && openShifts.length > 0 && (
        <SectionCard title={`Open shifts (${openShifts.length})`} description="Shifts that lost their driver because of approved leave. Pick a free driver for each." bodyClassName="p-0" className="mb-4 border-amber-300">
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
        title={`${formatDay(start, "dd MMM")} – ${formatDay(end, "dd MMM yyyy")}`}
        description={
          canEdit || canAttend
            ? "Click any cell to edit the shift, prime mover or attendance. Missing cells are created when saved. A red outline means a prime mover is double-booked on a shift."
            : "Read-only view of the roster."
        }
        bodyClassName="p-0"
        actions={
          <>
            {!isDriver && (
              <>
                <SearchInput value={q} onChange={setQ} placeholder="Find driver…" className="hidden w-40 sm:block" />
                <NativeSelect className="hidden w-32 sm:block" value={shiftFilter} onValueChange={setShiftFilter} placeholder="All shifts" options={["Morning", "Afternoon", "Night", "Rotating"]} aria-label="Default shift filter" />
              </>
            )}
            <Button variant="outline" size="icon-sm" aria-label="Previous period" onClick={() => shift(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRange(today, addDays(today, 13))} disabled={isDefaultRange}>
              Today
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="Next period" onClick={() => shift(1)}>
              <ChevronRight />
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-sm">
          <label className="flex items-center gap-2 text-slate">
            From
            <Input type="date" value={start} onChange={(e) => setRange(e.target.value, end < e.target.value ? e.target.value : end)} className="h-8 w-40" aria-label="Roster from date" />
          </label>
          <label className="flex items-center gap-2 text-slate">
            To
            <Input type="date" value={end} min={start} onChange={(e) => setRange(start, e.target.value)} className="h-8 w-40" aria-label="Roster to date" />
          </label>
          <span className="text-xs text-slate">{span} day{span === 1 ? "" : "s"} shown (up to {MAX_DAYS}). Days outside the seeded roster show as not rostered.</span>
        </div>
        {drivers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate">No drivers match.</div>
        ) : (
          <RosterCalendar
            start={start}
            days={span}
            drivers={drivers}
            roster={roster}
            showCoverage={!isDriver}
            onCellClick={canEdit || canAttend ? (driver, date, entry) => setCell({ driver, date, entry }) : undefined}
          />
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-[11px] text-slate">
          <span className="font-medium text-ink">Legend</span>
          <span>Morning / Afternoon / Night / Off / Leave</span>
          <span>&ldquo;→ DR-xxx&rdquo; = covered by another driver</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" />Present</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" />Late</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-red-500" />Absent</span>
          <span>Cover rows exclude drivers marked absent.</span>
        </div>
      </SectionCard>

      {!isDriver && (
        <SectionCard title="Roster rules check" description={`Checked for ${formatDay(start, "dd MMM")} – ${formatDay(end, "dd MMM")} and the drivers shown above.`} className="mt-4">
          <ul className="space-y-1.5">
            {ruleChecks.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-sm">
                <span className={c.passed ? "mt-0.5 text-success" : "mt-0.5 text-danger"}>{c.passed ? <Check className="size-4" /> : <X className="size-4" />}</span>
                <div className="min-w-0">
                  <span className="text-ink">{c.label}</span> <span className="text-xs text-slate">· {c.detail}</span>
                  {c.problems.length > 0 && <div className="text-xs text-danger">{c.problems.slice(0, 4).join(" · ")}{c.problems.length > 4 ? ` · +${c.problems.length - 4} more` : ""}</div>}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

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
