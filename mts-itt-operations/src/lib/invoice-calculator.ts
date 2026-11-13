import type { DB } from "@/types/db";
import type { Invoice, InvoiceLine, RateRecord } from "@/types/invoice";
import type { ContainerSize, TerminalCode } from "@/types/terminal";
import { monthRange } from "./date-utils";
import { invoiceEligibility, movementDay, unitsFor } from "./eligibility";
import { round2 } from "./payment-calculator";

/** Effective-dated rate lookup: the Active rate whose window contains the movement's operational day. */
export function findRate(
  rates: RateRecord[],
  source: TerminalCode,
  destination: TerminalCode,
  size: ContainerSize,
  day: string,
): RateRecord | undefined {
  return rates
    .filter(
      (r) =>
        r.status === "Active" &&
        r.source === source &&
        r.destination === destination &&
        r.containerSize === size &&
        r.effectiveFrom <= day &&
        (r.effectiveTo === null || r.effectiveTo >= day),
    )
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
}

export interface InvoiceCriteria {
  terminal: TerminalCode;
  month: string;
  route: string | null; // "CWIT-JCT"
  size: ContainerSize | null;
  dieselOverridePct: number | null;
  /** Invoice id to ignore when checking double-billing (when regenerating) */
  ignoreInvoiceId?: string;
}

export interface InvoiceCalc {
  lines: InvoiceLine[];
  excluded: { movementId: string; reason: string }[];
  baseAmount: number;
  dieselAmount: number;
  finalAmount: number;
}

export function calculateInvoice(db: DB, c: InvoiceCriteria): InvoiceCalc {
  const { from, to } = monthRange(c.month);
  const lines: InvoiceLine[] = [];
  const excluded: InvoiceCalc["excluded"] = [];
  const alreadyInvoiced = new Map<string, string>();
  for (const inv of db.invoices) {
    if (inv.id === c.ignoreInvoiceId) continue;
    for (const l of inv.lines) alreadyInvoiced.set(l.movementId, inv.invoiceNo);
  }

  for (const m of db.movements) {
    if (m.sourceTerminal !== c.terminal) continue;
    const day = movementDay(m, db.settings.opDayStartHour);
    if (!day || day < from || day > to) continue;
    const route = `${m.sourceTerminal}-${m.destinationTerminal}`;
    if (c.route && route !== c.route) continue;
    if (c.size && m.containerSize !== c.size) continue;

    const el = invoiceEligibility(m, db);
    if (!el.eligible) {
      excluded.push({ movementId: m.id, reason: el.reason ?? "Not billable" });
      continue;
    }
    const dup = alreadyInvoiced.get(m.id);
    if (dup) {
      excluded.push({ movementId: m.id, reason: `Already on ${dup}` });
      continue;
    }
    const rate = findRate(db.rates, m.sourceTerminal, m.destinationTerminal, m.containerSize, day);
    if (!rate) {
      excluded.push({ movementId: m.id, reason: "No effective rate for route/size/date" });
      continue;
    }
    const units = unitsFor(m, db.settings.billingUnitMode);
    const base = round2(units * rate.baseRate);
    const dieselPct = c.dieselOverridePct ?? rate.dieselAdjustmentPct;
    lines.push({
      movementId: m.id,
      containerNos: m.containerNos,
      containerSize: m.containerSize,
      route,
      movementDate: day,
      units,
      rateId: rate.id,
      rate: rate.baseRate,
      baseAmount: base,
      dieselPct,
      dieselAmount: round2((base * dieselPct) / 100),
    });
  }
  const baseAmount = round2(lines.reduce((s, l) => s + l.baseAmount, 0));
  const dieselAmount = round2(lines.reduce((s, l) => s + l.dieselAmount, 0));
  return { lines, excluded, baseAmount, dieselAmount, finalAmount: round2(baseAmount + dieselAmount) };
}

export function invoiceBreakdown(inv: Pick<Invoice, "lines">) {
  const byRoute = new Map<string, { route: string; movements: number; units: number; base: number; diesel: number }>();
  const bySize = new Map<ContainerSize, { size: ContainerSize; movements: number; containers: number; units: number; base: number }>();
  for (const l of inv.lines) {
    const r = byRoute.get(l.route) ?? { route: l.route, movements: 0, units: 0, base: 0, diesel: 0 };
    r.movements += 1;
    r.units += l.units;
    r.base = round2(r.base + l.baseAmount);
    r.diesel = round2(r.diesel + l.dieselAmount);
    byRoute.set(l.route, r);
    const s = bySize.get(l.containerSize) ?? { size: l.containerSize, movements: 0, containers: 0, units: 0, base: 0 };
    s.movements += 1;
    s.containers += l.containerNos.length;
    s.units += l.units;
    s.base = round2(s.base + l.baseAmount);
    bySize.set(l.containerSize, s);
  }
  return { byRoute: [...byRoute.values()], bySize: [...bySize.values()] };
}
