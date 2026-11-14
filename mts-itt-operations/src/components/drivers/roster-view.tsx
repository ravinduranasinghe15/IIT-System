"use client";

import { useMemo, useState } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, Info, Moon, Sun, UserRoundCheck, UserRoundX } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect } from "@/components/shared/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { addDays, demoToday, eachDay, formatDay } from "@/lib/date-utils";
import { ROSTER_START } from "@/data/mock-drivers";
import type { Driver, RosterEntry } from "@/types/driver";
import { RosterCalendar, RosterCellDialog, isWorkingShift } from "./roster-calendar";
import { AttendanceDialog } from "./attendance-dialog";
import { LeavePanel, LeaveRequestDialog } from "./leave-dialogs";

export function RosterView() {
  const { db } = useApp();
  const { can, isDriver, driverId } = useAuth();
  const today = demoToday();
  const [start, setStart] = useState(ROSTER_START);
  const [end, setEnd] = useState(addDays(ROSTER_START, 13));
  const [q, setQ] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [cell, setCell] = useState<{ driver: Driver; date: string; entry?: RosterEntry } | null>(null);
  const [attendanceOpen, setAttendanceOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

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
  const isDefaultRange = start === ROSTER_START && end === addDays(ROSTER_START, 13);

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
  const nightToday = todayRows.filter((r) => r.shift === "Night" && r.attendance !== "Absent").length;
  const absentToday = todayRows.filter((r) => r.attendance === "Absent").length;
  const pendingLeave = db.leaves.filter((l) => l.status === "Pending").length;
  const activeDrivers = db.drivers.filter((d) => d.status === "Active").length;
  const activePms = db.primeMovers.filter((p) => p.status === "Active").length;

  const own = isDriver && driverId ? db.drivers.find((d) => d.id === driverId) : null;

  return (
    <div>
      <PageHeader
        title={isDriver ? "My roster" : "Driver roster"}
        description={
          isDriver
            ? `Your shifts and prime-mover assignments${own ? ` (${own.name})` : ""}.`
            : "Shift calendar with a selectable date range and morning / night coverage for continuous 24-hour operation."
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
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Morning shift today" value={morningToday} icon={Sun} tone="orange" hint="Drivers excl. absent" />
            <StatCard label="Night shift today" value={nightToday} icon={Moon} tone="navy" hint="Drivers excl. absent" />
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
                <strong>{db.settings.driversPerTruck ?? "not set"}</strong>). Currently registered: {activeDrivers} active drivers, {activePms} active prime movers. Operation is continuous (24h), so cover is shown per
                Morning and Night shift; shift hours are a demo assumption.
              </p>
            </div>
          </div>
        </>
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
                <NativeSelect className="hidden w-32 sm:block" value={shiftFilter} onValueChange={setShiftFilter} placeholder="All shifts" options={["Morning", "Night", "Rotating"]} aria-label="Default shift filter" />
              </>
            )}
            <Button variant="outline" size="icon-sm" aria-label="Previous period" onClick={() => shift(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRange(ROSTER_START, addDays(ROSTER_START, 13))} disabled={isDefaultRange}>
              Current
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
          <span>Morning / Night / Off / Leave</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-emerald-500" />Present</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-amber-500" />Late</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-red-500" />Absent</span>
          <span>Cover rows exclude drivers marked absent.</span>
        </div>
      </SectionCard>

      <div className="mt-4">
        <LeavePanel driverId={isDriver ? driverId : undefined} onRequest={() => setLeaveOpen(true)} />
      </div>

      {cell && <RosterCellDialog driver={cell.driver} date={cell.date} entry={db.roster.find((r) => r.driverId === cell.driver.id && r.date === cell.date)} onClose={() => setCell(null)} />}
      {attendanceOpen && <AttendanceDialog open onOpenChange={setAttendanceOpen} />}
      {leaveOpen && <LeaveRequestDialog open onOpenChange={setLeaveOpen} fixedDriverId={isDriver ? driverId : undefined} />}
    </div>
  );
}
