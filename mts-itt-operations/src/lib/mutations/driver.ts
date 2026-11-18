import type { DB } from "@/types/db";
import type { AttendanceStatus, Driver, DriverStatus, LeaveRecord, RosterEntry, RosterShift, ShiftType } from "@/types/driver";
import { actorOf, logAudit, notify, nowOf } from "@/lib/db-helpers";
import { addDays, eachDay, formatDate, realToday } from "@/lib/date-utils";
import { SHIFT_HOURS, availableDrivers, breaksWeeklyOff, getterFor, isWorkShift, restConflict, type WorkShift } from "@/lib/roster-rules";
import { nextSeqId } from "@/lib/fleet-utils";
import { refreshMovementDrivers } from "@/lib/movement-driver";
import { generateRoster, planDates, type RosterPlan } from "@/lib/roster-generator";
import { can } from "@/lib/permissions";

/** Driver, roster, attendance and leave mutators. All take a draft DB (use inside `update`). */

export interface DriverInput {
  name: string;
  phone: string;
  licenseNo: string;
  licenseExpiry: string;
  status: DriverStatus;
  shift: ShiftType;
  joinedAt: string;
  address: string;
  emergencyContact: string;
}

function findDriver(d: DB, id: string): Driver {
  const drv = d.drivers.find((x) => x.id === id);
  if (!drv) throw new Error(`Driver ${id} not found`);
  return drv;
}

export function registerDriver(d: DB, input: DriverInput): Driver {
  const id = nextSeqId(d.drivers.map((x) => x.id), "DR-", 3);
  const drv: Driver = { id, ...input, name: input.name.trim() };
  d.drivers.push(drv);
  logAudit(d, { action: "Driver Registered", module: "Drivers", entityId: id, description: `Registered driver ${drv.name} (${id}), licence ${drv.licenseNo}, shift ${drv.shift}.` });
  notify(d, { title: "New driver registered", body: `${drv.name} (${id}) was added to the driver directory.`, level: "info", href: `/drivers/${id}` });
  return drv;
}

export function updateDriver(d: DB, id: string, input: DriverInput): Driver {
  const drv = findDriver(d, id);
  const changes: string[] = [];
  (["name", "phone", "licenseNo", "licenseExpiry", "status", "shift", "joinedAt", "address", "emergencyContact"] as const).forEach((k) => {
    const next = typeof input[k] === "string" ? input[k].trim() : input[k];
    if (drv[k] !== next) {
      changes.push(`${k}: "${drv[k]}" → "${next}"`);
      (drv as unknown as Record<string, string>)[k] = next;
    }
  });
  logAudit(d, {
    action: "Driver Updated",
    module: "Drivers",
    entityId: id,
    description: changes.length ? `Updated ${drv.name} (${id}): ${changes.join("; ")}.` : `Saved ${drv.name} (${id}) with no changes.`,
  });
  return drv;
}

export function setDriverStatus(d: DB, id: string, status: DriverStatus, note = ""): Driver {
  const drv = findDriver(d, id);
  const prev = drv.status;
  drv.status = status;
  logAudit(d, {
    action: "Driver Status Changed",
    module: "Drivers",
    entityId: id,
    description: `${drv.name} (${id}) status ${prev} → ${status}.${note ? ` Note: ${note}` : ""}`,
  });
  return drv;
}

/* ───────────────────────── roster ───────────────────────── */

export interface RosterPatch {
  shift?: RosterShift;
  primeMoverId?: string | null;
  attendance?: AttendanceStatus;
}

const isWorking = (s: RosterShift) => isWorkShift(s);

/** A truck that is free on `date` for `shift` (not on another driver's shift); the driver's truck from the day before is preferred for continuity. */
function freeTruck(d: DB, date: string, shift: WorkShift, driverId: string): string | null {
  const taken = new Set(d.roster.filter((r) => r.date === date && r.shift === shift && r.driverId !== driverId && r.primeMoverId).map((r) => r.primeMoverId as string));
  const yesterday = d.roster.find((r) => r.driverId === driverId && r.date === addDays(date, -1))?.primeMoverId ?? null;
  const free = d.primeMovers.filter((p) => p.status === "Active" && !taken.has(p.id));
  return (free.find((p) => p.id === yesterday) ?? free[0])?.id ?? null;
}

/** Finds the roster cell for (driver, date) or generates it (as "Off") so missing cells can be edited. */
export function ensureRosterEntry(d: DB, driverId: string, date: string): RosterEntry {
  const found = d.roster.find((r) => r.driverId === driverId && r.date === date);
  if (found) return found;
  const entry: RosterEntry = {
    id: nextSeqId(d.roster.map((r) => r.id), "RS-", 4),
    driverId,
    date,
    shift: "Off",
    primeMoverId: null,
    attendance: "Scheduled",
  };
  d.roster.push(entry);
  return entry;
}

export function updateRosterCell(d: DB, driverId: string, date: string, patch: RosterPatch): RosterEntry {
  const drv = findDriver(d, driverId);
  const entry = ensureRosterEntry(d, driverId, date);
  const before = `${entry.shift}${entry.primeMoverId ? ` on ${entry.primeMoverId}` : ""}, ${entry.attendance}`;
  const actor = actorOf(d);
  if (patch.shift !== undefined && patch.shift !== entry.shift) {
    if (isWorkShift(patch.shift)) {
      // Roster rules: enough rest next to the neighbouring days, and at least one day off in every 7 days.
      const get = getterFor(d.roster, driverId);
      const rest = restConflict(get, date, patch.shift);
      if (rest) throw new Error(rest);
      if (breaksWeeklyOff(get, date)) throw new Error(`${drv.name} would have no day off in a 7-day stretch. Every driver needs at least one day off every week.`);
    }
    entry.shift = patch.shift;
    if (!isWorking(patch.shift)) {
      entry.primeMoverId = null;
      entry.attendance = "Scheduled";
      entry.recordedBy = undefined;
      entry.coveredBy = undefined;
      entry.coveringFor = undefined;
    } else if (!entry.primeMoverId) {
      entry.primeMoverId = freeTruck(d, date, patch.shift as WorkShift, driverId);
    }
  }
  if (patch.primeMoverId !== undefined && isWorking(entry.shift)) {
    const clash = patch.primeMoverId ? d.roster.find((r) => r.id !== entry.id && r.date === entry.date && r.shift === entry.shift && r.primeMoverId === patch.primeMoverId && r.attendance !== "Absent") : null;
    if (clash) throw new Error(`${patch.primeMoverId} is already rostered for the ${entry.shift} shift on ${formatDate(entry.date)}.`);
    entry.primeMoverId = patch.primeMoverId || null;
  }
  if (patch.attendance !== undefined && isWorking(entry.shift)) {
    entry.attendance = patch.attendance;
    entry.recordedBy = patch.attendance === "Scheduled" ? undefined : actor.name;
    if (patch.attendance !== "Absent" && entry.absentReason && !entry.coveredBy) {
      // the absence report was a mistake / the driver turned up: withdraw it and its open shift
      entry.absentReason = undefined;
      entry.absenceReportedBy = undefined;
      entry.absenceReportedAt = undefined;
      d.openShifts = d.openShifts.filter((o) => !(o.absence && o.driverId === driverId && o.date === date));
    }
  }
  const after = `${entry.shift}${entry.primeMoverId ? ` on ${entry.primeMoverId}` : ""}, ${entry.attendance}`;
  const attendanceOnly = patch.attendance !== undefined && patch.shift === undefined && patch.primeMoverId === undefined;
  logAudit(d, {
    action: attendanceOnly ? "Attendance Recorded" : "Roster Updated",
    module: "Roster",
    entityId: entry.id,
    description: `${drv.name} (${driverId}) on ${formatDate(date)}: ${before} → ${after}.`,
  });
  refreshMovementDrivers(d);
  return entry;
}

export function recordAttendance(d: DB, driverId: string, date: string, status: AttendanceStatus): RosterEntry {
  const entry = d.roster.find((r) => r.driverId === driverId && r.date === date);
  if (!entry || !isWorking(entry.shift)) throw new Error("Attendance can only be recorded for a Morning or Night shift.");
  return updateRosterCell(d, driverId, date, { attendance: status });
}

export interface AbsenceInput {
  driverId: string;
  date: string;
  reason: string;
  note?: string;
}

/**
 * A driver rings the supervisor to say he is not coming: the supervisor marks the shift Absent with a reason.
 * The shift becomes an open shift for the Manager to cover, and the Manager is notified automatically.
 */
export function reportAbsence(d: DB, input: AbsenceInput): RosterEntry {
  const drv = findDriver(d, input.driverId);
  const entry = d.roster.find((r) => r.driverId === input.driverId && r.date === input.date);
  if (!entry || !isWorking(entry.shift)) throw new Error(`${drv.name} has no Morning or Night shift on ${formatDate(input.date)}.`);
  if (entry.absentReason) throw new Error(`${drv.name}'s absence on ${formatDate(input.date)} was already reported.`);
  if (!input.reason.trim()) throw new Error("Select the reason the driver gave.");
  const actor = actorOf(d);
  const shift = entry.shift as WorkShift;
  const reason = input.note?.trim() ? `${input.reason} – ${input.note.trim()}` : input.reason;
  entry.attendance = "Absent";
  entry.recordedBy = actor.name;
  entry.absentReason = reason;
  entry.absenceReportedBy = actor.name;
  entry.absenceReportedAt = nowOf(d);
  if (!entry.coveredBy && !d.openShifts.some((o) => o.driverId === drv.id && o.date === input.date)) {
    d.openShifts.push({
      id: nextSeqId(d.openShifts.map((o) => o.id), "OS-", 4),
      date: input.date,
      shift,
      primeMoverId: entry.primeMoverId,
      driverId: drv.id,
      reason: `${drv.name} not coming – ${reason}`,
      createdAt: nowOf(d),
      absence: true,
    });
  }
  const range = SHIFT_HOURS[shift].range;
  logAudit(d, {
    action: "Driver Absence Reported",
    module: "Roster",
    entityId: entry.id,
    description: `${drv.name} (${drv.id}) will not attend the ${shift} shift (${range}) on ${formatDate(input.date)}: ${reason}. Reported by ${actor.name}; replacement needed.`,
  });
  notify(d, {
    title: "Driver absent – replacement needed",
    body: `${drv.name} is not coming for the ${shift} shift (${range}) on ${formatDate(input.date)}${entry.primeMoverId ? ` (${entry.primeMoverId})` : ""}. Reason: ${reason}. Reported by ${actor.name}. Please assign a replacement.`,
    level: "warning",
    href: "/drivers/roster",
  });
  return entry;
}

export interface PublishResult {
  added: number;
  removed: number;
  planned: number;
  covered: number;
  warnings: string[];
}

/** The Manager publishes a generated roster for a period. Past days, leave, absences and recorded attendance are never touched. */
export function publishRoster(d: DB, plan: RosterPlan): PublishResult {
  const actor = actorOf(d);
  if (!can(actor.role, "roster.edit")) throw new Error("Only the Manager can generate a roster.");
  if (plan.days < 1 || plan.days > 31) throw new Error("A roster period must be between 1 and 31 days.");
  const gen = generateRoster(d, plan);
  const gone = new Set(gen.removeIds);
  d.roster = d.roster.filter((r) => !gone.has(r.id));
  const ids = d.roster.map((r) => r.id);
  for (const e of gen.entries) {
    const id = nextSeqId(ids, "RS-", 4);
    ids.push(id);
    d.roster.push({ id, ...e });
  }
  const dates = planDates(plan);
  const from = formatDate(dates[0]);
  const to = formatDate(dates[dates.length - 1]);
  const mode = plan.mode === "week" ? `${plan.perShift.Morning} Morning / ${plan.perShift.Night} Night trucks every day` : "date-wise truck counts";
  logAudit(d, {
    action: "Roster Generated",
    module: "Roster",
    entityId: `${dates[0]}..${dates[dates.length - 1]}`,
    description: `${actor.name} generated the roster for ${from} – ${to} (${mode}; ${plan.apply === "replace" ? "replaced future days" : "filled gaps only"}${plan.excludedTrucks.length ? `; trucks left out: ${plan.excludedTrucks.join(", ")}` : ""}). ${gen.totalCovered} of ${gen.totalPlanned} truck-shifts covered; ${gen.entries.filter((e) => e.shift !== "Off").length} shifts added.`,
  });
  notify(d, {
    title: "New roster published",
    body: `The roster for ${from} – ${to} was generated by ${actor.name}: ${gen.totalCovered} of ${gen.totalPlanned} truck-shifts covered. Drivers can check their shifts under My roster.`,
    level: gen.totalCovered < gen.totalPlanned ? "warning" : "success",
    href: "/drivers/roster",
  });
  refreshMovementDrivers(d);
  return { added: gen.entries.filter((e) => e.shift !== "Off").length, removed: gen.removeIds.length, planned: gen.totalPlanned, covered: gen.totalCovered, warnings: gen.warnings };
}

/** Prime movers rostered for more than one driver on the same date and shift. */
export function rosterConflicts(roster: RosterEntry[]): Map<string, string[]> {
  const byKey = new Map<string, string[]>();
  for (const r of roster) {
    if (!isWorking(r.shift) || !r.primeMoverId) continue;
    const k = `${r.date}|${r.shift}|${r.primeMoverId}`;
    byKey.set(k, [...(byKey.get(k) ?? []), r.driverId]);
  }
  const out = new Map<string, string[]>();
  for (const [k, drivers] of byKey) {
    if (drivers.length < 2) continue;
    for (const dId of drivers) out.set(`${dId}|${k.split("|")[0]}`, drivers.filter((x) => x !== dId));
  }
  return out;
}

/* ───────────────────────── leave ───────────────────────── */

export interface LeaveInput {
  driverId: string;
  from: string;
  to: string;
  type: LeaveRecord["type"];
  reason: string;
}

export function requestLeave(d: DB, input: LeaveInput): LeaveRecord {
  const drv = findDriver(d, input.driverId);
  const rec: LeaveRecord = {
    id: nextSeqId(d.leaves.map((l) => l.id), "LV-", 4),
    ...input,
    reason: input.reason.trim(),
    status: "Pending",
    requestedAt: nowOf(d),
  };
  d.leaves.unshift(rec);
  logAudit(d, { action: "Leave Requested", module: "Roster", entityId: rec.id, description: `${drv.name} (${drv.id}) requested ${rec.type} leave ${formatDate(rec.from)} to ${formatDate(rec.to)}.` });
  notify(d, { title: "Leave request pending", body: `${drv.name} requested ${rec.type} leave (${formatDate(rec.from)} – ${formatDate(rec.to)}).`, level: "info", href: "/drivers/roster" });
  return rec;
}

export function decideLeave(d: DB, leaveId: string, decision: "Approved" | "Rejected"): LeaveRecord {
  const rec = d.leaves.find((l) => l.id === leaveId);
  if (!rec) throw new Error(`Leave ${leaveId} not found`);
  if (rec.status !== "Pending") throw new Error(`Leave ${leaveId} was already ${rec.status.toLowerCase()}.`);
  const drv = findDriver(d, rec.driverId);
  rec.status = decision;
  rec.decidedBy = actorOf(d).name;
  let touched = 0;
  if (decision === "Approved") {
    for (const date of eachDay(rec.from, rec.to)) {
      const entry = ensureRosterEntry(d, rec.driverId, date);
      if (isWorkShift(entry.shift) && date >= realToday()) {
        d.openShifts.push({
          id: nextSeqId(d.openShifts.map((o) => o.id), "OS-", 4),
          date,
          shift: entry.shift,
          primeMoverId: entry.primeMoverId,
          driverId: rec.driverId,
          reason: `${drv.name} on ${rec.type} leave`,
          createdAt: nowOf(d),
        });
      }
      if (entry.shift !== "Leave") {
        entry.shift = "Leave";
        entry.primeMoverId = null;
        entry.attendance = "Scheduled";
        entry.recordedBy = undefined;
        entry.coveredBy = undefined;
        entry.coveringFor = undefined;
      }
      touched += 1;
    }
  }
  logAudit(d, {
    action: decision === "Approved" ? "Leave Approved" : "Leave Rejected",
    module: "Roster",
    entityId: rec.id,
    description: `${decision} ${rec.type} leave for ${drv.name} (${drv.id}), ${formatDate(rec.from)} to ${formatDate(rec.to)}.${decision === "Approved" ? ` ${touched} roster day(s) set to Leave.` : ""}`,
  });
  return rec;
}

/* ───────────────────────── replacing a driver ───────────────────────── */

export interface ReplaceInput {
  date: string;
  shift: WorkShift;
  toDriverId: string;
  primeMoverId: string | null;
  /** Driver who is absent (shift stays on their row, marked Absent) */
  fromDriverId?: string;
  /** Open shift (from approved leave) this assignment fills */
  openShiftId?: string;
}

/** Assign an available driver to a shift whose driver is absent or on leave. The roster updates immediately. */
export function replaceDriver(d: DB, input: ReplaceInput): RosterEntry {
  const to = findDriver(d, input.toDriverId);
  const available = availableDrivers(d, input.date, input.shift, input.fromDriverId, input.primeMoverId).some((a) => a.driver.id === to.id);
  if (!available) throw new Error(`${to.name} is not available for the ${input.shift} shift on ${formatDate(input.date)}.`);
  const actor = actorOf(d);
  const truck = input.primeMoverId ?? freeTruck(d, input.date, input.shift, to.id);

  const entry = ensureRosterEntry(d, to.id, input.date);
  entry.shift = input.shift;
  entry.primeMoverId = truck;
  entry.attendance = "Scheduled";
  entry.recordedBy = undefined;
  entry.coveringFor = input.fromDriverId ?? d.openShifts.find((o) => o.id === input.openShiftId)?.driverId;
  entry.coveredBy = undefined;

  let fromName = "";
  if (input.fromDriverId) {
    const from = findDriver(d, input.fromDriverId);
    fromName = from.name;
    const fromEntry = d.roster.find((r) => r.driverId === from.id && r.date === input.date);
    if (fromEntry) {
      fromEntry.attendance = "Absent";
      fromEntry.primeMoverId = null;
      fromEntry.coveredBy = to.id;
      fromEntry.recordedBy = actor.name;
    }
  }
  if (input.openShiftId) d.openShifts = d.openShifts.filter((o) => o.id !== input.openShiftId);

  const range = SHIFT_HOURS[input.shift].range;
  logAudit(d, {
    action: "Shift Reassigned",
    module: "Roster",
    entityId: entry.id,
    description: `${to.name} (${to.id}) assigned to the ${input.shift} shift (${range}) on ${formatDate(input.date)}${truck ? ` on ${truck}` : ""}${fromName ? ` replacing ${fromName}` : ""}.`,
  });
  refreshMovementDrivers(d);
  notify(d, {
    title: "Shift reassigned",
    body: `${to.name} now covers ${input.shift} (${range}) on ${formatDate(input.date)}${fromName ? ` for ${fromName}` : ""}.`,
    level: "info",
    href: "/drivers/roster",
  });
  return entry;
}
