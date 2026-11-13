import type { DB } from "@/types/db";
import type { PayRun } from "@/types/payment";
import { computePayLines } from "@/lib/payment-calculator";
import { PAY_ANCHOR, addDays } from "@/lib/date-utils";
import { nextId } from "@/lib/db-helpers";

function run(db: DB, index: number, status: PayRun["status"]): PayRun {
  const start = addDays(PAY_ANCHOR, index * 15);
  const end = addDays(start, 14);
  let lines = computePayLines(db, start, end);
  if (index === 0 && lines[2]) {
    lines = lines.map((l, i) => (i === 2 ? { ...l, adjustments: 25, adjustmentNote: "Night-shift allowance (demo)", total: Math.round((l.baseAmount + 25) * 100) / 100 } : l));
  }
  const generatedAt = `${addDays(end, 1)}T09:30`;
  return {
    id: nextId(db, "payrun", "PAY-", 3),
    periodStart: start,
    periodEnd: end,
    status,
    unitMode: db.settings.payUnitMode,
    rates: { ...db.settings.payRates },
    currency: db.settings.currency,
    generatedAt,
    generatedBy: "Shalini de Silva",
    approvedAt: status === "Approved" ? `${addDays(end, 2)}T14:00` : undefined,
    approvedBy: status === "Approved" ? "Hasini Jayawardena" : undefined,
    lines,
    history: [
      { at: generatedAt, by: "Shalini de Silva", action: "Draft generated", note: `Eligible movements retrieved for ${start} → ${end}.` },
      ...(status === "Approved"
        ? [
            { at: `${addDays(end, 1)}T15:00`, by: "Shalini de Silva", action: "Submitted" as const, note: "Reviewed driver breakdowns." },
            { at: `${addDays(end, 2)}T14:00`, by: "Hasini Jayawardena", action: "Approved" as const, note: "Simulated approval (demo)." },
          ]
        : []),
    ],
  };
}

export function buildPayRuns(db: DB) {
  const runs = [run(db, 0, "Approved"), run(db, 1, "Approved")];
  const current = run(db, 2, "Draft");
  current.generatedAt = "2026-11-13T09:10";
  current.history[0].at = "2026-11-13T09:10";
  runs.push(current);
  db.payRuns = runs.reverse();
}
