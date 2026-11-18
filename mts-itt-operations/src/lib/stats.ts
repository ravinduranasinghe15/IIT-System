import type { DB } from "@/types/db";
import type { Movement } from "@/types/movement";
import type { TerminalCode } from "@/types/terminal";
import { addDays, eachDay, minutesBetween } from "./date-utils";
import { movementDay } from "./eligibility";

/** Pure dashboard statistics derived from the shared DB. All "days" are operational days (07:00→07:00). */

export const SOURCE_TERMINALS: TerminalCode[] = ["CWIT", "SAGT", "CICT"];

export const isDoneStatus = (s: Movement["status"]) => s === "Completed";
export const isRejectedStatus = (s: Movement["status"]) => s === "Rejected" || s === "Damaged";
export const isPendingStatus = (s: Movement["status"]) => s === "Pending" || s === "In Transit" || s === "Under Review";

export const containerCount = (ms: Movement[]) => ms.reduce((n, m) => n + m.containerNos.length, 0);

export function movementsOnDay(db: DB, day: string, ms: Movement[] = db.movements): Movement[] {
  return ms.filter((m) => movementDay(m, db.settings.opDayStartHour) === day);
}

export interface TodayStats {
  total: number;
  completed: number;
  pending: number;
  rejected: number;
  containers: number;
  openExceptions: number;
  activePrimeMovers: number;
  totalPrimeMovers: number;
  registeredDrivers: number;
  activeDrivers: number;
  containers20: number;
  containers40: number;
}

export function todayStats(db: DB, today: string, ms: Movement[] = db.movements): TodayStats {
  const list = movementsOnDay(db, today, ms);
  const containers = containerCount(list);
  return {
    total: list.length,
    completed: list.filter((m) => isDoneStatus(m.status)).length,
    pending: list.filter((m) => isPendingStatus(m.status)).length,
    rejected: list.filter((m) => isRejectedStatus(m.status)).length,
    containers,
    openExceptions: db.exceptions.filter((e) => e.status === "Open" || e.status === "Under Review").length,
    activePrimeMovers: db.primeMovers.filter((p) => p.status === "Active").length,
    totalPrimeMovers: db.primeMovers.length,
    registeredDrivers: db.drivers.length,
    activeDrivers: db.drivers.filter((d) => d.status === "Active").length,
    containers20: list.filter((m) => m.containerSize === "20FT").reduce((n, m) => n + m.containerNos.length, 0),
    containers40: list.filter((m) => m.containerSize === "40FT").reduce((n, m) => n + m.containerNos.length, 0),
  };
}

export interface TrendPoint {
  day: string;
  completed: number;
  pending: number;
  rejected: number;
  total: number;
}

/** Last `days` operational days ending at `today`, oldest first. */
export function dailyTrend(db: DB, today: string, days = 14, ms: Movement[] = db.movements): TrendPoint[] {
  const from = addDays(today, -(days - 1));
  const buckets = new Map<string, TrendPoint>(eachDay(from, today).map((d) => [d, { day: d, completed: 0, pending: 0, rejected: 0, total: 0 }]));
  for (const m of ms) {
    const day = movementDay(m, db.settings.opDayStartHour);
    const b = day ? buckets.get(day) : undefined;
    if (!b) continue;
    b.total++;
    if (isDoneStatus(m.status)) b.completed++;
    else if (isRejectedStatus(m.status)) b.rejected++;
    else b.pending++;
  }
  return [...buckets.values()];
}

export function inWindow(db: DB, ms: Movement[], today: string, days: number): Movement[] {
  const from = addDays(today, -(days - 1));
  return ms.filter((m) => {
    const d = movementDay(m, db.settings.opDayStartHour);
    return !!d && d >= from && d <= today;
  });
}

export interface TerminalStat {
  terminal: TerminalCode;
  movements: number;
  containers: number;
  completed: number;
  rejected: number;
  completionRate: number;
  openExceptions: number;
  avgTransitMin: number | null;
}

export function terminalStats(db: DB, today: string, days = 14, ms: Movement[] = db.movements): TerminalStat[] {
  const win = inWindow(db, ms, today, days);
  return SOURCE_TERMINALS.map((terminal) => {
    const list = win.filter((m) => m.sourceTerminal === terminal);
    const done = list.filter((m) => isDoneStatus(m.status));
    const times = done.filter((m) => m.loadingAt && m.dischargeAt).map((m) => minutesBetween(m.loadingAt as string, m.dischargeAt as string)).filter((n) => n >= 0);
    const ids = new Set(list.map((m) => m.id));
    return {
      terminal,
      movements: list.length,
      containers: containerCount(list),
      completed: done.length,
      rejected: list.filter((m) => isRejectedStatus(m.status)).length,
      completionRate: list.length ? done.length / list.length : 0,
      openExceptions: db.exceptions.filter((e) => ids.has(e.movementId) && (e.status === "Open" || e.status === "Under Review")).length,
      avgTransitMin: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    };
  });
}

export function containerDistribution(ms: Movement[]) {
  const c20 = ms.filter((m) => m.containerSize === "20FT").reduce((n, m) => n + m.containerNos.length, 0);
  const c40 = ms.filter((m) => m.containerSize === "40FT").reduce((n, m) => n + m.containerNos.length, 0);
  return [
    { name: "20FT", value: c20 },
    { name: "40FT", value: c40 },
  ];
}

export interface FleetRow {
  id: string;
  regNo: string;
  status: string;
  driverId: string | null;
  movementsToday: number;
  movementsWindow: number;
}

export function fleetStatus(db: DB, today: string, ms: Movement[] = db.movements): FleetRow[] {
  const todayList = movementsOnDay(db, today, ms);
  const win = inWindow(db, ms, today, 14);
  return db.primeMovers.map((p) => ({
    id: p.id,
    regNo: p.regNo,
    status: p.status,
    // the driver rostered on this truck today (drivers are not tied to a truck)
    driverId: db.roster.find((r) => r.date === today && r.primeMoverId === p.id && r.attendance !== "Absent")?.driverId ?? null,
    movementsToday: todayList.filter((m) => m.primeMoverId === p.id).length,
    movementsWindow: win.filter((m) => m.primeMoverId === p.id).length,
  }));
}

export function fleetUtilisation(db: DB, today: string) {
  const rows = fleetStatus(db, today);
  const active = rows.filter((r) => r.status === "Active").length;
  const maintenance = rows.filter((r) => r.status === "In Maintenance").length;
  const inactive = rows.filter((r) => r.status === "Inactive").length;
  const working = rows.filter((r) => r.status === "Active" && r.movementsToday > 0).length;
  return { active, maintenance, inactive, working, total: rows.length };
}

/** Recent movements newest first by loading/discharge time, falling back to creation time. */
export function recentMovements(ms: Movement[], limit = 8): Movement[] {
  const key = (m: Movement) => m.loadingAt ?? m.dischargeAt ?? m.createdAt;
  return [...ms].sort((a, b) => (key(a) < key(b) ? 1 : -1)).slice(0, limit);
}
