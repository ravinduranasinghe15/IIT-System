import type { DB } from "@/types/db";
import type { PayLine, PayRun } from "@/types/payment";
import { computePayLines } from "@/lib/payment-calculator";
import { demoToday, formatDate, payPeriodFor } from "@/lib/date-utils";
import { logAudit, nextId, nowOf } from "@/lib/db-helpers";
import { formatMoney } from "@/lib/utils";

const SYSTEM = "System (automatic)";

/** Plain-language list of what moved between two versions of the pay lines. */
function describeChanges(before: PayLine[], after: PayLine[], currency: string): string[] {
  const out: string[] = [];
  const ids = new Set([...before.map((l) => l.driverId), ...after.map((l) => l.driverId)]);
  for (const id of ids) {
    const b = before.find((l) => l.driverId === id);
    const a = after.find((l) => l.driverId === id);
    const name = a?.driverName ?? b?.driverName ?? id;
    const du = (a?.payableUnits ?? 0) - (b?.payableUnits ?? 0);
    const dp = (a?.pendingAmount ?? 0) - (b?.pendingAmount ?? 0);
    const dx = (a?.excluded.length ?? 0) - (b?.excluded.length ?? 0);
    if (!du && !dp && !dx) continue;
    const parts: string[] = [];
    if (du) parts.push(`${du > 0 ? "+" : ""}${du} payable unit${Math.abs(du) === 1 ? "" : "s"} (now ${formatMoney(a?.total ?? 0, currency)})`);
    if (dp) parts.push(`${dp > 0 ? "+" : "-"}${formatMoney(Math.abs(dp), currency)} pending`);
    if (!du && !dp && dx) parts.push(`${dx > 0 ? "+" : ""}${dx} excluded movement${Math.abs(dx) === 1 ? "" : "s"}`);
    out.push(`${name}: ${parts.join(", ")}`);
  }
  return out;
}

/**
 * Keeps the live pay period up to date. Called after every change to the data (see `update` in app-context).
 * - Creates the Draft for the current 15-day period as soon as it has movements.
 * - Recalculates it (adjustments preserved) and records what changed.
 * - Approved periods are locked and never touched.
 */
export function syncLivePayRun(db: DB): void {
  const period = payPeriodFor(demoToday());
  const run = db.payRuns.find((r) => r.periodStart === period.start && r.periodEnd === period.end);
  if (run?.status === "Approved") return;

  const lines = computePayLines(db, period.start, period.end, run?.lines);
  const now = nowOf(db);

  if (!run) {
    if (lines.length === 0) return;
    const id = nextId(db, "payrun", "PAY-", 3);
    const created: PayRun = {
      id,
      periodStart: period.start,
      periodEnd: period.end,
      status: "Draft",
      unitMode: db.settings.payUnitMode,
      rates: { ...db.settings.payRates },
      currency: db.settings.currency,
      generatedAt: now,
      generatedBy: SYSTEM,
      lines,
      history: [{ at: now, by: SYSTEM, action: "Draft generated", note: `Created automatically for ${formatDate(period.start)} – ${formatDate(period.end)}; it updates by itself as movements change.` }],
    };
    db.payRuns.unshift(created);
    logAudit(db, { action: "Pay Draft Generated", module: "Payments", entityId: id, description: `${id} created automatically for ${formatDate(period.start)} - ${formatDate(period.end)}.` }, undefined);
    return;
  }

  const changes = describeChanges(run.lines, lines, db.settings.currency);
  const settingsChanged =
    run.unitMode !== db.settings.payUnitMode ||
    run.currency !== db.settings.currency ||
    run.rates["20FT"] !== db.settings.payRates["20FT"] ||
    run.rates["40FT"] !== db.settings.payRates["40FT"];
  if (changes.length === 0 && !settingsChanged) return;

  run.lines = lines;
  run.unitMode = db.settings.payUnitMode;
  run.rates = { ...db.settings.payRates };
  run.currency = db.settings.currency;
  const shown = changes.slice(0, 3).join("; ");
  const more = changes.length > 3 ? `; +${changes.length - 3} more driver(s)` : "";
  run.history.push({
    at: now,
    by: SYSTEM,
    action: "Auto-updated",
    note: changes.length ? `${shown}${more}.` : "Rates or pay settings changed; amounts recalculated.",
  });
}
