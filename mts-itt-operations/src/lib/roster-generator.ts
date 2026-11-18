import type { DB } from "@/types/db";
import type { RosterEntry } from "@/types/driver";
import { addDays, eachDay, formatDay, realToday } from "./date-utils";
import { WORK_SHIFTS, breaksWeeklyOff, isWorkShift, restConflict, type EntryGetter, type WorkShift } from "./roster-rules";

/**
 * Manager-driven roster generation. The Manager says how many trucks run on each shift (the same for the whole week, or
 * date by date); the generator picks the trucks and a driver for each, following the roster rules (rest, weekly day off, one driver
 * per truck per shift). Drivers are not tied to a truck. Pure: it only reports what it would do (see `publishRoster` in mutations/driver.ts).
 */

export type ShiftCounts = Record<WorkShift, number>;

export interface RosterPlan {
  /** First day of the period (yyyy-MM-dd) */
  start: string;
  /** Number of days (7 for a week) */
  days: number;
  mode: "week" | "daily";
  /** Whole-week mode: trucks per shift on every day */
  perShift: ShiftCounts;
  /** Date-wise mode: trucks per shift for each date (missing date = 0) */
  daily: Record<string, ShiftCounts>;
  /** Trucks the Manager does not want on the road in this period */
  excludedTrucks: string[];
  /** replace = rebuild the future days of the period; fill = keep what is already rostered and only add what is missing */
  apply: "replace" | "fill";
}

export interface SlotCoverage {
  date: string;
  planned: ShiftCounts;
  covered: ShiftCounts;
}

export interface GeneratedRoster {
  /** Roster entries to add (ids are assigned when published) */
  entries: Omit<RosterEntry, "id">[];
  /** Existing entry ids that are replaced */
  removeIds: string[];
  coverage: SlotCoverage[];
  warnings: string[];
  totalPlanned: number;
  totalCovered: number;
}

export const zeroCounts = (): ShiftCounts => ({ Morning: 0, Night: 0 });

export function planDates(plan: Pick<RosterPlan, "start" | "days">): string[] {
  return eachDay(plan.start, addDays(plan.start, plan.days - 1));
}

export function plannedFor(plan: RosterPlan, date: string): ShiftCounts {
  return plan.mode === "week" ? { ...plan.perShift } : { ...zeroCounts(), ...(plan.daily[date] ?? {}) };
}

/** First Monday on or after the day after `today` – the default "next week". */
export function nextMonday(today = realToday()): string {
  let d = addDays(today, 1);
  while (new Date(`${d}T00:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1);
  return d;
}

/** An existing entry that must never be rebuilt: leave, an absence report, a cover arrangement or recorded attendance. */
const isLocked = (r: RosterEntry) => r.shift === "Leave" || !!r.absentReason || !!r.coveredBy || !!r.coveringFor || r.attendance !== "Scheduled";

export function generateRoster(db: DB, plan: RosterPlan, today = realToday()): GeneratedRoster {
  const dates = planDates(plan);
  const warnings: string[] = [];
  const dateSet = new Set(dates);
  const editable = (date: string) => date >= today;

  // Working copy of the roster: entries of the period are removed (replace) or kept (fill) before generating.
  const removeIds: string[] = [];
  const work: RosterEntry[] = [];
  for (const r of db.roster) {
    const inPeriod = dateSet.has(r.date) && editable(r.date);
    if (inPeriod && plan.apply === "replace" && !isLocked(r)) {
      removeIds.push(r.id);
      continue;
    }
    work.push(r);
  }
  // index of the working copy by driver and date (fast neighbour look-ups for the rest / weekly-off rules)
  const idx = new Map<string, RosterEntry>();
  for (const r of work) idx.set(`${r.driverId}|${r.date}`, r);
  const added: Omit<RosterEntry, "id">[] = [];
  const push = (e: Omit<RosterEntry, "id">) => {
    added.push(e);
    const entry = { id: `NEW-${added.length}`, ...e };
    work.push(entry);
    idx.set(`${e.driverId}|${e.date}`, entry);
  };
  const getter = (id: string): EntryGetter => (date) => idx.get(`${id}|${date}`);
  /** Shifts a driver already works in the 6 days before `date` (spreads the days off) */
  const recentLoad = (id: string, date: string) => {
    let n = 0;
    for (let k = 1; k <= 6; k++) if (isWorkShift(idx.get(`${id}|${addDays(date, -k)}`)?.shift ?? "Off")) n++;
    return n;
  };
  // weekly rotation: a driver works Morning one week and Night the next. His "week" starts the day after his usual day off,
  // so a driver switching from Night to Morning has had a rest day in between (the rest rule forbids Night -> Morning next day).
  const order0 = new Map(db.drivers.map((d, i) => [d.id, i]));
  const dayNum = (date: string) => Math.floor(Date.parse(`${date}T00:00:00Z`) / 86400000);
  // every driver has a usual weekly day off (spread over the week) that is only given up when somebody is needed
  const usualOff = (id: string, date: string) => (dayNum(date) + (order0.get(id) ?? 0)) % 7 === 6;
  const preferred = (id: string, date: string): WorkShift => ((Math.floor((dayNum(date) + (order0.get(id) ?? 0) + 1) / 7) + (order0.get(id) ?? 0)) % 2 === 0 ? "Morning" : "Night");

  const trucks = db.primeMovers.filter((p) => p.status === "Active" && !plan.excludedTrucks.includes(p.id)).map((p) => p.id);
  const drivers = db.drivers.filter((d) => d.status === "Active");
  const usage = new Map<string, number>(); // days a truck is used in this period
  const worked = new Map<string, number>(); // shifts a driver is given in this period

  const coverage: SlotCoverage[] = [];
  let totalPlanned = 0;
  let totalCovered = 0;

  for (const date of dates) {
    const planned = plannedFor(plan, date);
    const covered = zeroCounts();
    if (!editable(date)) {
      coverage.push({ date, planned, covered });
      continue;
    }
    const todays = work.filter((r) => r.date === date);
    const busy = new Set(todays.map((r) => r.driverId)); // already has an entry (work / leave) that day
    const onTruck = (shift: WorkShift) => new Set(todays.filter((r) => r.shift === shift && r.primeMoverId).map((r) => r.primeMoverId as string));
    const taken: Record<WorkShift, Set<string>> = { Morning: onTruck("Morning"), Night: onTruck("Night") };
    const need: ShiftCounts = { ...planned };
    for (const s of WORK_SHIFTS) {
      const already = todays.filter((r) => r.shift === s).length;
      covered[s] = plan.apply === "fill" ? Math.min(already, planned[s]) : 0;
      need[s] = Math.max(0, planned[s] - covered[s]);
    }
    // a driver who already has a shift entry (locked or kept) cannot be used again
    for (const r of todays) busy.add(r.driverId);

    // any rested driver can drive any truck: drivers are not tied to a truck
    const available = (shift: WorkShift) =>
      drivers.filter((d) => !busy.has(d.id)).filter((d) => {
        const get = getter(d.id);
        return !restConflict(get, date, shift) && !breaksWeeklyOff(get, date);
      });

    const exhausted = new Set<WorkShift>();
    const order = (): WorkShift => (need.Morning >= need.Night ? "Morning" : "Night");
    while ((need.Morning > 0 && !exhausted.has("Morning")) || (need.Night > 0 && !exhausted.has("Night"))) {
      let shift = order();
      if (need[shift] <= 0 || exhausted.has(shift)) shift = shift === "Morning" ? "Night" : "Morning";
      const free = available(shift);
      const options = trucks.filter((t) => !taken[shift].has(t));
      if (free.length === 0 || options.length === 0) {
        exhausted.add(shift);
        continue;
      }
      // trucks used least first so the work is spread over the fleet
      const truck = [...options].sort((a, b) => (usage.get(a) ?? 0) - (usage.get(b) ?? 0) || a.localeCompare(b))[0];
      const prev = (id: string) => idx.get(`${id}|${addDays(date, -1)}`);
      // drivers who are not on their usual day off first, then the driver whose week it is for this shift, then the one who had this truck yesterday, then the one who has
      // worked the fewest of the last 6 days (so days off are spread), then whoever has worked least in the period
      const driver = [...free].sort(
        (a, b) =>
          Number(usualOff(a.id, date)) - Number(usualOff(b.id, date)) ||
          Number(preferred(a.id, date) !== shift) - Number(preferred(b.id, date) !== shift) ||
          Number(prev(b.id)?.primeMoverId === truck) - Number(prev(a.id)?.primeMoverId === truck) ||
          recentLoad(a.id, date) - recentLoad(b.id, date) ||
          (worked.get(a.id) ?? 0) - (worked.get(b.id) ?? 0) ||
          a.id.localeCompare(b.id),
      )[0];
      push({ driverId: driver.id, date, shift, primeMoverId: truck, attendance: "Scheduled" });
      busy.add(driver.id);
      taken[shift].add(truck);
      usage.set(truck, (usage.get(truck) ?? 0) + 1);
      worked.set(driver.id, (worked.get(driver.id) ?? 0) + 1);
      covered[shift] += 1;
      need[shift] -= 1;
    }

    // everybody else is off that day (leave entries stay as they are)
    for (const d of drivers) {
      if (!idx.has(`${d.id}|${date}`)) push({ driverId: d.id, date, shift: "Off", primeMoverId: null, attendance: "Scheduled" });
    }

    for (const s of WORK_SHIFTS) {
      totalPlanned += planned[s];
      totalCovered += covered[s];
      if (covered[s] < planned[s]) {
        warnings.push(`${formatDay(date, "EEE dd MMM")} ${s}: ${planned[s]} truck(s) planned, only ${covered[s]} can be covered with the available drivers and rest rules.`);
      }
    }
    coverage.push({ date, planned, covered });
  }

  if (plan.excludedTrucks.length === 0 && trucks.length > 0) {
    for (const date of dates) {
      const p = plannedFor(plan, date);
      if (p.Morning > trucks.length || p.Night > trucks.length) {
        warnings.push(`${formatDay(date, "EEE dd MMM")}: more trucks planned per shift than the ${trucks.length} active trucks.`);
        break;
      }
    }
  }
  if (!editable(dates[0])) warnings.unshift("Days before today are never changed; only today and later days are generated.");

  return { entries: added, removeIds, coverage, warnings, totalPlanned, totalCovered };
}

/** Number of drivers per truck (how many people can drive it) – used to hint the maximum for a shift. */
export function maxTrucksHint(db: DB, excluded: string[]): number {
  return db.primeMovers.filter((p) => p.status === "Active" && !excluded.includes(p.id)).length;
}
