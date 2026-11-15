import type { DB } from "@/types/db";
import type { Driver, RosterEntry, RosterShift } from "@/types/driver";
import { addDays, eachDay, formatDay } from "./date-utils";

/**
 * Roster rules (demo defaults – confirm with MTS):
 *  - three 8-hour shifts cover the 7:00 AM → 7:00 AM operational day;
 *  - a driver works at most one shift (8 h) per day;
 *  - at least 8 hours' rest between two shifts;
 *  - at least one day off (or leave) in every 7 days;
 *  - drivers rotate through the shifts and through different trucks.
 */
export const WORK_SHIFTS = ["Morning", "Afternoon", "Night"] as const;
export type WorkShift = (typeof WORK_SHIFTS)[number];
export const isWorkShift = (s: RosterShift | string): s is WorkShift => s === "Morning" || s === "Afternoon" || s === "Night";

export const SHIFT_HOURS: Record<WorkShift, { start: number; end: number; range: string; short: string }> = {
  Morning: { start: 7, end: 15, range: "7:00 AM – 3:00 PM", short: "7a – 3p" },
  Afternoon: { start: 15, end: 23, range: "3:00 PM – 11:00 PM", short: "3p – 11p" },
  Night: { start: 23, end: 31, range: "11:00 PM – 7:00 AM", short: "11p – 7a" },
};
export const SHIFT_LENGTH_HOURS = 8;
export const MIN_REST_HOURS = 8;
export const ROSTER_DAYS_BACK = 7;
export const ROSTER_DAYS_AHEAD = 30;

const HOUR = 3_600_000;
const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`);
const startMs = (date: string, s: WorkShift) => dayMs(date) + SHIFT_HOURS[s].start * HOUR;
const endMs = (date: string, s: WorkShift) => dayMs(date) + SHIFT_HOURS[s].end * HOUR;

/** Hours of rest between the end of one shift and the start of the next. */
export function restGapHours(prevDate: string, prev: WorkShift, nextDate: string, next: WorkShift): number {
  return (startMs(nextDate, next) - endMs(prevDate, prev)) / HOUR;
}

export type EntryGetter = (date: string) => RosterEntry | undefined;

/** Error text if putting `shift` on `date` leaves less than the minimum rest next to the neighbouring days. */
export function restConflict(get: EntryGetter, date: string, shift: WorkShift): string | null {
  const prev = get(addDays(date, -1));
  if (prev && isWorkShift(prev.shift)) {
    const gap = restGapHours(prev.date, prev.shift, date, shift);
    if (gap < MIN_REST_HOURS)
      return `Not enough rest: ${prev.shift} on ${formatDay(prev.date, "EEE dd MMM")} ends at ${SHIFT_HOURS[prev.shift].range.split(" – ")[1]}, only ${gap} h before this ${shift} shift (minimum ${MIN_REST_HOURS} h).`;
  }
  const next = get(addDays(date, 1));
  if (next && isWorkShift(next.shift)) {
    const gap = restGapHours(date, shift, next.date, next.shift);
    if (gap < MIN_REST_HOURS)
      return `Not enough rest: this ${shift} shift ends only ${gap} h before the ${next.shift} shift on ${formatDay(next.date, "EEE dd MMM")} (minimum ${MIN_REST_HOURS} h).`;
  }
  return null;
}

/** True if working `date` would leave a 7-day stretch with no day off or leave. */
export function breaksWeeklyOff(get: EntryGetter, date: string): boolean {
  for (let s = -6; s <= 0; s++) {
    let allWorking = true;
    for (let k = 0; k < 7; k++) {
      const d = addDays(date, s + k);
      if (d === date) continue;
      const e = get(d);
      if (!e || !isWorkShift(e.shift)) {
        allWorking = false;
        break;
      }
    }
    if (allWorking) return true;
  }
  return false;
}

export const getterFor = (roster: RosterEntry[], driverId: string): EntryGetter => {
  const m = new Map(roster.filter((r) => r.driverId === driverId).map((r) => [r.date, r]));
  return (date) => m.get(date);
};

export interface AvailableDriver {
  driver: Driver;
  lastShift: string;
  recentTrucks: string[];
  usesWeeklyOff: boolean;
}

/** Drivers who are free for `shift` on `date`: active, no shift or leave that day, and rested. `usesWeeklyOff` = this is their only day off this week. */
export function availableDrivers(db: DB, date: string, shift: WorkShift, excludeDriverId?: string): AvailableDriver[] {
  const out: AvailableDriver[] = [];
  for (const driver of db.drivers) {
    if (driver.status !== "Active" || driver.id === excludeDriverId) continue;
    const get = getterFor(db.roster, driver.id);
    const same = get(date);
    if (same && (isWorkShift(same.shift) || same.shift === "Leave")) continue;
    if (restConflict(get, date, shift)) continue;
    const usesWeeklyOff = breaksWeeklyOff(get, date);
    const history = db.roster.filter((r) => r.driverId === driver.id && isWorkShift(r.shift) && r.date < date).sort((a, b) => (a.date < b.date ? 1 : -1));
    const last = history[0];
    const trucks = Array.from(new Set(history.slice(0, 5).map((r) => r.primeMoverId).filter(Boolean) as string[])).slice(0, 3);
    out.push({
      driver,
      lastShift: last ? `${last.shift} on ${formatDay(last.date, "EEE dd MMM")}` : "No recent shift",
      recentTrucks: trucks,
      usesWeeklyOff,
    });
  }
  return out.sort((a, b) => Number(a.usesWeeklyOff) - Number(b.usesWeeklyOff) || a.driver.name.localeCompare(b.driver.name));
}

export interface RuleCheck {
  key: string;
  label: string;
  passed: boolean;
  /** Short text, e.g. "14 of 14 drivers" */
  detail: string;
  problems: string[];
}

/** Checks the rules over [from, to] for the given drivers. */
export function checkRosterRules(drivers: Driver[], roster: RosterEntry[], from: string, to: string): RuleCheck[] {
  const days = eachDay(from, to);
  const byDriver = new Map<string, Map<string, RosterEntry>>();
  for (const r of roster) {
    if (r.date < from || r.date > to) continue;
    const m = byDriver.get(r.driverId) ?? new Map<string, RosterEntry>();
    m.set(r.date, r);
    byDriver.set(r.driverId, m);
  }
  const rest: string[] = [];
  const off: string[] = [];
  const mix: string[] = [];
  const trucks: string[] = [];
  for (const d of drivers) {
    const m = byDriver.get(d.id) ?? new Map<string, RosterEntry>();
    for (const date of days) {
      const e = m.get(date);
      const n = m.get(addDays(date, 1));
      if (e && n && isWorkShift(e.shift) && isWorkShift(n.shift) && restGapHours(e.date, e.shift, n.date, n.shift) < MIN_REST_HOURS)
        rest.push(`${d.name}: ${e.shift} ${formatDay(date, "dd MMM")} → ${n.shift} ${formatDay(n.date, "dd MMM")}`);
    }
    if (days.length >= 7) {
      let broken = false;
      for (let i = 0; i + 6 < days.length && !broken; i++) {
        broken = days.slice(i, i + 7).every((dt) => {
          const e = m.get(dt);
          return e && isWorkShift(e.shift);
        });
      }
      if (broken) off.push(d.name);
    }
    const worked = days.map((dt) => m.get(dt)).filter((e): e is RosterEntry => !!e && isWorkShift(e.shift));
    if (worked.length >= 5 && new Set(worked.map((e) => e.shift)).size < 2) mix.push(d.name);
    if (worked.length >= 3 && new Set(worked.map((e) => e.primeMoverId).filter(Boolean)).size < 2) trucks.push(d.name);
  }
  const n = drivers.length;
  const res = (key: string, label: string, problems: string[], okText: string): RuleCheck => ({
    key,
    label,
    passed: problems.length === 0,
    detail: problems.length === 0 ? okText : `${problems.length} problem${problems.length === 1 ? "" : "s"}`,
    problems,
  });
  return [
    res("hours", `One ${SHIFT_LENGTH_HOURS}-hour shift per driver per day`, [], `${n} of ${n} drivers`),
    res("rest", `At least ${MIN_REST_HOURS} hours of rest between shifts`, rest, `${n} of ${n} drivers`),
    res("off", "At least one day off in every 7 days", off, days.length >= 7 ? `${n} of ${n} drivers` : "Select 7+ days to check"),
    res("mix", "Drivers rotate through different shifts", mix, `${n} of ${n} drivers`),
    res("trucks", "Drivers use more than one truck", trucks, `${n} of ${n} drivers`),
  ];
}
