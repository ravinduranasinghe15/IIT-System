import type { DB } from "@/types/db";
import type { TerminalCode } from "@/types/terminal";
import { addDays, eachDay, formatDay, monthRange } from "./date-utils";
import { defaultFilters, filterMovements, movementRevenue, weekStart } from "./reports";

/**
 * ITT analysis report – the dashboard MTS sends every week ("Daily Analysis Report - ITT (MTS) … (7-7) Time"),
 * generated from the system's own movements, fuel and rate data for any day, week, month or custom range.
 * Days are 07:00 → 07:00 operational days.
 */

export type IttPeriod = "daily" | "weekly" | "monthly" | "custom";
export const SOURCE_TERMINALS: TerminalCode[] = ["CWIT", "SAGT", "CICT"];

export function periodRange(kind: IttPeriod, anchor: string, custom?: { from: string; to: string }): { from: string; to: string } {
  if (kind === "daily") return { from: anchor, to: anchor };
  if (kind === "weekly") {
    const s = weekStart(anchor);
    return { from: s, to: addDays(s, 6) };
  }
  if (kind === "monthly") return monthRange(anchor.slice(0, 7));
  return custom && custom.from && custom.to && custom.from <= custom.to ? custom : { from: anchor, to: anchor };
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface IttVehicleRow {
  id: string;
  regNo: string;
  trips: number;
  perDay: number;
  perShift: number;
  c20: number;
  c40: number;
  gpsKm: number;
  gpsLitres: number;
  refuelLitres: number;
  refuelCost: number;
  kmPerLitreRefuel: number | null;
  kmPerLitreGps: number | null;
}

export interface IttDriverRow {
  id: string;
  name: string;
  trips: number;
  shifts: number;
  perShift: number;
  permanent: boolean;
}

export interface IttAnalysis {
  from: string;
  to: string;
  days: number;
  totalTrips: number;
  bySource: Record<string, number>;
  vehiclesUsed: number;
  avgTripsPerVehicleDay: number;
  fuel: { gpsKm: number; gpsLitres: number; refuelLitres: number; refuelCost: number; kmPerLitreRefuel: number | null; kmPerLitreGps: number | null };
  revenue: { bySource: Record<string, number>; total: number; dailyAvg: number; unrated: number } | null;
  daily: { date: string; label: string; Trips: number; Vehicles: number; CWIT: number; SAGT: number; CICT: number }[];
  flow: { date: string; label: string; Pickup: number; DropOff: number }[];
  vehicles: IttVehicleRow[];
  size: { name: string; journeys: number; containers: number }[];
  drivers: IttDriverRow[];
  permanent: { trips: number; shifts: number; drivers: number };
  temporary: { trips: number; shifts: number; drivers: number };
  dropBySource: Record<string, { name: string; value: number }[]>;
  pickupShare: { name: string; value: number }[];
}

export function buildIttAnalysis(db: DB, from: string, to: string, canFinancial: boolean, focus: TerminalCode = "SAGT"): IttAnalysis {
  const dates = eachDay(from, to);
  const days = Math.max(1, dates.length);
  const infos = filterMovements(db, { ...defaultFilters(), from, to }).filter((i) => i.m.status !== "Pending");

  const bySource: Record<string, number> = { CWIT: 0, SAGT: 0, CICT: 0 };
  for (const { m } of infos) bySource[m.sourceTerminal] = (bySource[m.sourceTerminal] ?? 0) + 1;

  const regOf = new Map(db.primeMovers.map((p) => [p.id, p.regNo]));
  const driverById = new Map(db.drivers.map((d) => [d.id, d]));

  // ---- per day
  const dayMap = new Map(dates.map((d) => [d, { Trips: 0, veh: new Set<string>(), CWIT: 0, SAGT: 0, CICT: 0, pickup: 0, drop: 0 }]));
  for (const { m, day } of infos) {
    const b = dayMap.get(day);
    if (!b) continue;
    b.Trips += 1;
    if (m.primeMoverId) b.veh.add(m.primeMoverId);
    if (m.sourceTerminal in bySource) b[m.sourceTerminal as "CWIT" | "SAGT" | "CICT"] += 1;
    if (m.sourceTerminal === focus) b.pickup += 1;
    if (m.destinationTerminal === focus) b.drop += 1;
  }
  const daily = dates.map((d) => {
    const b = dayMap.get(d)!;
    return { date: d, label: formatDay(d, "dd/MM"), Trips: b.Trips, Vehicles: b.veh.size, CWIT: b.CWIT, SAGT: b.SAGT, CICT: b.CICT };
  });
  const flow = dates.map((d) => ({ date: d, label: formatDay(d, "dd/MM"), Pickup: dayMap.get(d)!.pickup, DropOff: dayMap.get(d)!.drop }));

  // ---- fuel (GPS-estimated vs fuel-station)
  const fuelRecs = db.fuelRecords.filter((r) => r.date >= from && r.date <= to);
  const fuelOf = (vehicleId: string) => {
    const rs = fuelRecs.filter((r) => r.vehicleId === vehicleId);
    const gps = rs.filter((r) => r.source === "GPS");
    const stn = rs.filter((r) => r.source !== "GPS");
    return {
      gpsKm: gps.reduce((s, r) => s + (r.distanceKm ?? 0), 0),
      gpsLitres: gps.reduce((s, r) => s + r.litres, 0),
      refuelLitres: stn.reduce((s, r) => s + r.litres, 0),
      refuelCost: stn.reduce((s, r) => s + (r.amount ?? 0), 0),
    };
  };
  const kmL = (km: number, l: number) => (km > 0 && l > 0 ? r2(km / l) : null);

  // ---- per vehicle
  const vehicles: IttVehicleRow[] = db.primeMovers
    .map((p) => {
      const mine = infos.filter((i) => i.m.primeMoverId === p.id);
      const f = fuelOf(p.id);
      return {
        id: p.id,
        regNo: p.regNo,
        trips: mine.length,
        perDay: r2(mine.length / days),
        perShift: r2(mine.length / (days * 2)),
        c20: mine.filter((i) => i.m.containerSize === "20FT").length,
        c40: mine.filter((i) => i.m.containerSize === "40FT").length,
        gpsKm: r1(f.gpsKm),
        gpsLitres: r1(f.gpsLitres),
        refuelLitres: r1(f.refuelLitres),
        refuelCost: Math.round(f.refuelCost),
        kmPerLitreRefuel: kmL(f.gpsKm, f.refuelLitres),
        kmPerLitreGps: kmL(f.gpsKm, f.gpsLitres),
      };
    })
    .filter((v) => v.trips > 0 || v.gpsKm > 0 || v.refuelLitres > 0);

  const fuelTotals = vehicles.reduce(
    (a, v) => ({ gpsKm: a.gpsKm + v.gpsKm, gpsLitres: a.gpsLitres + v.gpsLitres, refuelLitres: a.refuelLitres + v.refuelLitres, refuelCost: a.refuelCost + v.refuelCost }),
    { gpsKm: 0, gpsLitres: 0, refuelLitres: 0, refuelCost: 0 },
  );

  // ---- container size
  const size = (["20FT", "40FT"] as const).map((s) => {
    const list = infos.filter((i) => i.m.containerSize === s);
    return { name: s, journeys: list.length, containers: list.reduce((n, i) => n + Math.max(1, i.m.containerNos.length), 0) };
  });

  // ---- drivers (permanent = the driver assigned to that truck; otherwise a temporary / relief driver)
  const drv = new Map<string, { trips: number; days: Set<string>; permTrips: number }>();
  for (const { m, day } of infos) {
    if (!m.driverId) continue;
    const d = driverById.get(m.driverId);
    const perm = !!d && !!m.primeMoverId && d.primeMoverId === m.primeMoverId;
    const o = drv.get(m.driverId) ?? { trips: 0, days: new Set<string>(), permTrips: 0 };
    o.trips += 1;
    o.days.add(day);
    if (perm) o.permTrips += 1;
    drv.set(m.driverId, o);
  }
  const drivers: IttDriverRow[] = [...drv.entries()]
    .map(([id, o]) => ({ id, name: driverById.get(id)?.name ?? id, trips: o.trips, shifts: o.days.size, perShift: r2(o.trips / Math.max(1, o.days.size)), permanent: o.permTrips >= o.trips / 2 }))
    .sort((a, b) => b.trips - a.trips);
  const sum = (list: IttDriverRow[]) => ({ trips: list.reduce((s, d) => s + d.trips, 0), shifts: list.reduce((s, d) => s + d.shifts, 0), drivers: list.length });

  // ---- breakdowns
  const dropBySource: IttAnalysis["dropBySource"] = {};
  for (const src of SOURCE_TERMINALS) {
    const m = new Map<string, number>();
    for (const { m: mv } of infos) if (mv.sourceTerminal === src) m.set(mv.destinationTerminal, (m.get(mv.destinationTerminal) ?? 0) + 1);
    dropBySource[src] = [...m.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }

  // ---- revenue (billable movements, rate card) – restricted to finance roles
  let revenue: IttAnalysis["revenue"] = null;
  if (canFinancial) {
    const rs: Record<string, number> = { CWIT: 0, SAGT: 0, CICT: 0 };
    let unrated = 0;
    for (const { m } of infos) {
      const rev = movementRevenue(m, db);
      if (rev === "unrated") unrated += 1;
      else if (rev) rs[m.sourceTerminal] = (rs[m.sourceTerminal] ?? 0) + rev.total;
    }
    const total = Object.values(rs).reduce((s, n) => s + n, 0);
    revenue = { bySource: rs, total: r2(total), dailyAvg: r2(total / days), unrated };
  }

  const used = new Set(infos.map((i) => i.m.primeMoverId).filter(Boolean));
  return {
    from,
    to,
    days,
    totalTrips: infos.length,
    bySource,
    vehiclesUsed: used.size,
    avgTripsPerVehicleDay: used.size ? r2(infos.length / (used.size * days)) : 0,
    fuel: { ...fuelTotals, kmPerLitreRefuel: kmL(fuelTotals.gpsKm, fuelTotals.refuelLitres), kmPerLitreGps: kmL(fuelTotals.gpsKm, fuelTotals.gpsLitres) },
    revenue,
    daily,
    flow,
    vehicles,
    size,
    drivers,
    permanent: sum(drivers.filter((d) => d.permanent)),
    temporary: sum(drivers.filter((d) => !d.permanent)),
    dropBySource,
    pickupShare: SOURCE_TERMINALS.map((t) => ({ name: t, value: bySource[t] ?? 0 })).filter((x) => x.value > 0),
  };
}
