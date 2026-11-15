import type { DB } from "@/types/db";
import type { PayLine, PayRun } from "@/types/payment";
import { movementDay, payEligibility, unitsFor } from "./eligibility";

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Total Earnings = Eligible Payable Units x Configured Rate + Adjustments
 * (rate is configured per container size; the line shows the blended rate).
 * Demo simulation – the contractual pay rule is not confirmed.
 */
export function computePayLines(
  db: DB,
  start: string,
  end: string,
  previous?: PayLine[],
): PayLine[] {
  const { payRates, payUnitMode, opDayStartHour } = db.settings;
  const byDriver = new Map<string, PayLine>();

  for (const m of db.movements) {
    const day = movementDay(m, opDayStartHour);
    if (!day || day < start || day > end) continue;
    const key = m.driverId ?? "UNASSIGNED";
    const driver = db.drivers.find((d) => d.id === key);
    let line = byDriver.get(key);
    if (!line) {
      line = {
        driverId: key,
        driverName: driver?.name ?? "Unassigned driver",
        movementIds: [],
        completedMovements: 0,
        payableUnits: 0,
        baseAmount: 0,
        rate: 0,
        adjustments: 0,
        adjustmentNote: "",
        total: 0,
        excluded: [],
        pendingUnits: 0,
        pendingAmount: 0,
      };
      byDriver.set(key, line);
    }
    if (m.status === "Completed") line.completedMovements += 1;
    const el = payEligibility(m, db);
    if (!el.eligible) {
      line.excluded.push({ movementId: m.id, reason: el.reason ?? "Not eligible" });
      if (m.status === "Completed" && m.driverId) {
        const u = unitsFor(m, payUnitMode);
        line.pendingUnits = (line.pendingUnits ?? 0) + u;
        line.pendingAmount = (line.pendingAmount ?? 0) + u * payRates[m.containerSize];
      }
      continue;
    }
    const units = unitsFor(m, payUnitMode);
    line.movementIds.push(m.id);
    line.payableUnits += units;
    line.baseAmount += units * payRates[m.containerSize];
  }

  const lines = [...byDriver.values()].filter((l) => l.driverId !== "UNASSIGNED" || l.excluded.length > 0);
  for (const l of lines) {
    const prev = previous?.find((p) => p.driverId === l.driverId);
    l.adjustments = prev?.adjustments ?? 0;
    l.adjustmentNote = prev?.adjustmentNote ?? "";
    l.baseAmount = round2(l.baseAmount);
    l.pendingAmount = round2(l.pendingAmount ?? 0);
    l.rate = l.payableUnits ? round2(l.baseAmount / l.payableUnits) : 0;
    l.total = round2(l.baseAmount + l.adjustments);
  }
  return lines.sort((a, b) => a.driverId.localeCompare(b.driverId));
}

export function payRunTotals(run: PayRun) {
  return run.lines.reduce(
    (acc, l) => ({
      movements: acc.movements + l.completedMovements,
      units: acc.units + l.payableUnits,
      total: round2(acc.total + l.total),
      excluded: acc.excluded + l.excluded.length,
    }),
    { movements: 0, units: 0, total: 0, excluded: 0 },
  );
}
