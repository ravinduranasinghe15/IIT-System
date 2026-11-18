import type { DB } from "@/types/db";
import type { FuelRecord } from "@/types/fuel";
import type { ServiceRecord } from "@/types/vehicle";
import { movementDay } from "./eligibility";
import { round2 } from "./payment-calculator";

/**
 * What MTS spends on one vehicle: fuel (fuel-station invoices and manual entries; GPS rows are only estimated litres with
 * no price) plus maintenance (completed service logs; scheduled or overdue ones are not spent yet).
 */

export interface MonthCost {
  month: string; // yyyy-MM
  litres: number;
  fuel: number;
  maintenance: number;
  total: number;
}

export interface VehicleCosts {
  from: string;
  to: string;
  fuelCost: number;
  fuelLitres: number;
  fills: number;
  maintenanceCost: number;
  services: number;
  total: number;
  trips: number;
  costPerTrip: number | null;
  /** Latest actual fill-up (fuel-station invoice or manual entry) before or at the end of the period, over all time */
  lastFuel: FuelRecord | null;
  /** Latest completed service over all time */
  lastService: ServiceRecord | null;
  /** Upcoming / overdue service entries (cost is only an estimate until completed) */
  openServices: ServiceRecord[];
  fuelRecords: FuelRecord[];
  serviceRecords: ServiceRecord[];
  monthly: MonthCost[];
}

const isFill = (r: FuelRecord) => r.source !== "GPS";
const monthOf = (day: string) => day.slice(0, 7);

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const end = to.slice(0, 7);
  for (let i = 0; i < 120; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function vehicleCosts(db: DB, vehicleId: string, from: string, to: string): VehicleCosts {
  const allFuel = db.fuelRecords.filter((r) => r.vehicleId === vehicleId && isFill(r));
  const allService = db.serviceRecords.filter((s) => s.vehicleId === vehicleId);
  const fuel = allFuel.filter((r) => r.date >= from && r.date <= to).sort((a, b) => (a.date < b.date ? 1 : -1));
  const done = allService.filter((s) => s.status === "Completed");
  const services = done.filter((s) => s.date >= from && s.date <= to).sort((a, b) => (a.date < b.date ? 1 : -1));

  const fuelCost = round2(fuel.reduce((s, r) => s + (r.amount ?? 0), 0));
  const maintenanceCost = round2(services.reduce((s, r) => s + r.cost, 0));
  const total = round2(fuelCost + maintenanceCost);
  const start = db.settings.opDayStartHour;
  const trips = db.movements.filter((m) => {
    if (m.primeMoverId !== vehicleId) return false;
    const day = movementDay(m, start);
    return !!day && day >= from && day <= to;
  }).length;

  const months = new Map<string, MonthCost>(monthsBetween(from, to).map((k) => [k, { month: k, litres: 0, fuel: 0, maintenance: 0, total: 0 }]));
  for (const r of fuel) {
    const o = months.get(monthOf(r.date));
    if (o) {
      o.litres += r.litres;
      o.fuel += r.amount ?? 0;
    }
  }
  for (const s of services) {
    const o = months.get(monthOf(s.date));
    if (o) o.maintenance += s.cost;
  }
  const monthly = [...months.values()].map((o) => ({ ...o, litres: round2(o.litres), fuel: round2(o.fuel), maintenance: round2(o.maintenance), total: round2(o.fuel + o.maintenance) }));

  return {
    from,
    to,
    fuelCost,
    fuelLitres: round2(fuel.reduce((s, r) => s + r.litres, 0)),
    fills: fuel.length,
    maintenanceCost,
    services: services.length,
    total,
    trips,
    costPerTrip: trips ? round2(total / trips) : null,
    lastFuel: [...allFuel].sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null,
    lastService: [...done].sort((a, b) => (a.date < b.date ? 1 : -1))[0] ?? null,
    openServices: allService.filter((s) => s.status !== "Completed").sort((a, b) => (a.date < b.date ? -1 : 1)),
    fuelRecords: fuel,
    serviceRecords: services,
    monthly,
  };
}
