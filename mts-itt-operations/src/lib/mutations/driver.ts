import type { DB } from "@/types/db";
import type { AttendanceStatus, Driver, DriverStatus, LeaveRecord, RosterEntry, RosterShift, ShiftType } from "@/types/driver";
import { actorOf, logAudit, notify, nowOf } from "@/lib/db-helpers";
import { eachDay, formatDate } from "@/lib/date-utils";
import { nextSeqId } from "@/lib/fleet-utils";

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
  /** "" or null = no prime mover */
  primeMoverId: string | null;
}

function findDriver(d: DB, id: string): Driver {
  const drv = d.drivers.find((x) => x.id === id);
  if (!drv) throw new Error(`Driver ${id} not found`);
  return drv;
}

/** Keeps Driver.primeMoverId and PrimeMover.driverId in sync (one driver <-> one prime mover as the primary assignment). */
export function assignPrimeMover(d: DB, driverId: string, primeMoverId: string | null, log = true): void {
  const drv = findDriver(d, driverId);
  const previous = drv.primeMoverId;
  if (previous === primeMoverId) return;
  if (previous) {
    const old = d.primeMovers.find((p) => p.id === previous);
    if (old && old.driverId === driverId) old.driverId = null;
  }
  let displaced: string | null = null;
  if (primeMoverId) {
    const pm = d.primeMovers.find((p) => p.id === primeMoverId);
    if (!pm) throw new Error(`Prime mover ${primeMoverId} not found`);
    if (pm.driverId && pm.driverId !== driverId) {
      displaced = pm.driverId;
      const other = d.drivers.find((x) => x.id === pm.driverId);
      if (other) other.primeMoverId = null;
    }
    pm.driverId = driverId;
  }
  drv.primeMoverId = primeMoverId;
  if (log) {
    logAudit(d, {
      action: primeMoverId ? "Prime Mover Assigned" : "Prime Mover Unassigned",
      module: "Drivers",
      entityId: driverId,
      description: primeMoverId
        ? `${drv.name} (${driverId}) assigned to ${primeMoverId}${previous ? ` (was ${previous})` : ""}${displaced ? `; ${displaced} was unassigned from ${primeMoverId}` : ""}.`
        : `${drv.name} (${driverId}) unassigned from ${previous}.`,
    });
  }
}

export function registerDriver(d: DB, input: DriverInput): Driver {
  const id = nextSeqId(d.drivers.map((x) => x.id), "DR-", 3);
  const drv: Driver = { id, ...input, name: input.name.trim(), primeMoverId: null };
  d.drivers.push(drv);
  logAudit(d, { action: "Driver Registered", module: "Drivers", entityId: id, description: `Registered driver ${drv.name} (${id}), licence ${drv.licenseNo}, shift ${drv.shift}.` });
  if (input.primeMoverId) assignPrimeMover(d, id, input.primeMoverId);
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
  const pmNext = input.primeMoverId || null;
  if (pmNext !== drv.primeMoverId) {
    assignPrimeMover(d, id, pmNext);
    changes.push(`prime mover → ${pmNext ?? "none"}`);
  }
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

const isWorking = (s: RosterShift) => s === "Morning" || s === "Night";

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
    entry.shift = patch.shift;
    if (!isWorking(patch.shift)) {
      entry.primeMoverId = null;
      entry.attendance = "Scheduled";
      entry.recordedBy = undefined;
    } else if (!entry.primeMoverId) {
      entry.primeMoverId = drv.primeMoverId;
    }
  }
  if (patch.primeMoverId !== undefined && isWorking(entry.shift)) entry.primeMoverId = patch.primeMoverId || null;
  if (patch.attendance !== undefined && isWorking(entry.shift)) {
    entry.attendance = patch.attendance;
    entry.recordedBy = patch.attendance === "Scheduled" ? undefined : actor.name;
  }
  const after = `${entry.shift}${entry.primeMoverId ? ` on ${entry.primeMoverId}` : ""}, ${entry.attendance}`;
  const attendanceOnly = patch.attendance !== undefined && patch.shift === undefined && patch.primeMoverId === undefined;
  logAudit(d, {
    action: attendanceOnly ? "Attendance Recorded" : "Roster Updated",
    module: "Roster",
    entityId: entry.id,
    description: `${drv.name} (${driverId}) on ${formatDate(date)}: ${before} → ${after}.`,
  });
  return entry;
}

export function recordAttendance(d: DB, driverId: string, date: string, status: AttendanceStatus): RosterEntry {
  const entry = d.roster.find((r) => r.driverId === driverId && r.date === date);
  if (!entry || !isWorking(entry.shift)) throw new Error("Attendance can only be recorded for a Morning or Night shift.");
  return updateRosterCell(d, driverId, date, { attendance: status });
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
      if (entry.shift !== "Leave") {
        entry.shift = "Leave";
        entry.primeMoverId = null;
        entry.attendance = "Scheduled";
        entry.recordedBy = undefined;
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
