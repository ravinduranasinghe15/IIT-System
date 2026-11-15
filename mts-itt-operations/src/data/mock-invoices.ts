import type { DB } from "@/types/db";
import type { Invoice, RateRecord } from "@/types/invoice";
import type { ContainerSize, TerminalCode } from "@/types/terminal";
import { calculateInvoice } from "@/lib/invoice-calculator";
import { nextId } from "@/lib/db-helpers";

const RATE_TABLE: { s: TerminalCode; d: TerminalCode; size: ContainerSize; old: number; neu: number; diesel: number; status?: RateRecord["status"] }[] = [
  { s: "CWIT", d: "JCT", size: "20FT", old: 62, neu: 65, diesel: 3.5 },
  { s: "CWIT", d: "JCT", size: "40FT", old: 94, neu: 98, diesel: 3.5 },
  { s: "SAGT", d: "JCT", size: "20FT", old: 60, neu: 63.5, diesel: 3.5 },
  { s: "SAGT", d: "JCT", size: "40FT", old: 91, neu: 95, diesel: 3.5 },
  { s: "CWIT", d: "SAGT", size: "20FT", old: 48, neu: 50, diesel: 2.8 },
  { s: "CWIT", d: "SAGT", size: "40FT", old: 72, neu: 75, diesel: 2.8 },
];

/** Billing rates were authored on a small scale; shown in LKR (x70, rounded to the nearest 50). */
const lkr = (n: number) => Math.round((n * 70) / 50) * 50;

export function buildRates(): RateRecord[] {
  const out: RateRecord[] = [];
  let n = 0;
  const id = () => `RT-${String(++n).padStart(3, "0")}`;
  for (const r of RATE_TABLE) {
    out.push({ id: id(), source: r.s, destination: r.d, containerSize: r.size, baseRate: lkr(r.old), effectiveFrom: "2026-01-01", effectiveTo: "2026-09-30", dieselAdjustmentPct: 2.5, status: "Inactive" });
    out.push({ id: id(), source: r.s, destination: r.d, containerSize: r.size, baseRate: lkr(r.neu), effectiveFrom: "2026-10-01", effectiveTo: null, dieselAdjustmentPct: r.diesel, status: "Active" });
  }
  // CICT pilot rates – draft until sample format and contract are confirmed
  out.push({ id: id(), source: "CICT", destination: "JCT", containerSize: "20FT", baseRate: lkr(66), effectiveFrom: "2026-11-01", effectiveTo: null, dieselAdjustmentPct: 3.5, status: "Draft" });
  out.push({ id: id(), source: "CICT", destination: "JCT", containerSize: "40FT", baseRate: lkr(99), effectiveFrom: "2026-11-01", effectiveTo: null, dieselAdjustmentPct: 3.5, status: "Draft" });
  return out;
}

function mk(db: DB, terminal: TerminalCode, month: string, status: Invoice["status"], seq: number, createdAt: string, events: Invoice["history"]): Invoice {
  const calc = calculateInvoice(db, { terminal, month, route: null, size: null, dieselOverridePct: null });
  return {
    id: nextId(db, "invoice", "INV-", 4),
    invoiceNo: `MTS-${month.replace("-", "")}-${terminal}-${String(seq).padStart(3, "0")}`,
    terminal,
    month,
    routeFilter: null,
    sizeFilter: null,
    unitMode: db.settings.billingUnitMode,
    currency: db.settings.currency,
    status,
    lines: calc.lines,
    dieselOverridePct: null,
    baseAmount: calc.baseAmount,
    dieselAmount: calc.dieselAmount,
    finalAmount: calc.finalAmount,
    excluded: calc.excluded,
    createdAt,
    createdBy: "Shalini de Silva",
    history: events,
  };
}

export function buildInvoices(db: DB) {
  const inv: Invoice[] = [
    mk(db, "CWIT", "2026-10", "Exported", 1, "2026-11-03T10:15", [
      { at: "2026-11-03T10:15", by: "Shalini de Silva", action: "Draft created", note: "October CWIT billing run." },
      { at: "2026-11-04T09:00", by: "Shalini de Silva", action: "Submitted for approval", note: "" },
      { at: "2026-11-04T15:30", by: "Hasini Jayawardena", action: "Approved", note: "Approved after exception check." },
      { at: "2026-11-05T11:00", by: "Shalini de Silva", action: "Exported", note: "CSV export for ERP upload (manual)." },
    ]),
    mk(db, "SAGT", "2026-10", "Approved", 1, "2026-11-03T10:40", [
      { at: "2026-11-03T10:40", by: "Shalini de Silva", action: "Draft created", note: "October SAGT billing run." },
      { at: "2026-11-05T09:20", by: "Shalini de Silva", action: "Submitted for approval", note: "" },
      { at: "2026-11-06T14:10", by: "Hasini Jayawardena", action: "Approved", note: "" },
    ]),
    mk(db, "CWIT", "2026-11", "Draft", 1, "2026-11-12T16:20", [
      { at: "2026-11-12T16:20", by: "Shalini de Silva", action: "Draft created", note: "Month-to-date November preview." },
    ]),
    mk(db, "SAGT", "2026-11", "Pending Approval", 1, "2026-11-12T16:35", [
      { at: "2026-11-12T16:35", by: "Shalini de Silva", action: "Draft created", note: "Month-to-date November preview." },
      { at: "2026-11-13T09:05", by: "Shalini de Silva", action: "Submitted for approval", note: "Awaiting authorised manager." },
    ]),
  ];
  db.invoices = inv.reverse();
}
