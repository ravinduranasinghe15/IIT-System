import type { DB } from "@/types/db";
import type { PayRun } from "@/types/payment";
import { computePayLines, round2 } from "@/lib/payment-calculator";
import { actorOf, logAudit, nextId, notify, nowOf } from "@/lib/db-helpers";
import { addDays, formatDate } from "@/lib/date-utils";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";

export type MutationResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A draft counts as "submitted" when its latest workflow event is a submission (any edit/regeneration resets it). */
export function isSubmitted(run: PayRun): boolean {
  if (run.status !== "Draft") return false;
  for (let i = run.history.length - 1; i >= 0; i--) {
    const a = run.history[i].action;
    if (a === "Submitted") return true;
    if (a === "Adjustment added" || a === "Auto-updated" || a === "Draft generated" || a === "Draft regenerated" || a === "Reopened") return false;
  }
  return false;
}

/** Generate (or regenerate, preserving adjustments) a Draft pay run for a 15-day period. */
export function generatePayRun(
  draft: DB,
  period: { start: string; end: string },
): MutationResult<{ id: string; regenerated: boolean }> {
  const actor = actorOf(draft);
  if (!can(actor.role, "payments.manage")) return { ok: false, error: "Your role cannot generate pay drafts." };
  if (!DAY_RE.test(period.start) || !DAY_RE.test(period.end)) return { ok: false, error: "Choose a valid period start date." };
  if (period.end !== addDays(period.start, 14)) return { ok: false, error: "A pay period must span exactly 15 days." };

  const same = draft.payRuns.filter((r) => r.periodStart === period.start && r.periodEnd === period.end);
  if (same.some((r) => r.status === "Approved")) {
    return { ok: false, error: "This period already has an Approved pay run, which is immutable." };
  }
  const existing = same.find((r) => r.status === "Draft");
  const now = nowOf(draft);
  const lines = computePayLines(draft, period.start, period.end, existing?.lines);
  const included = lines.reduce((s, l) => s + l.movementIds.length, 0);
  const excluded = lines.reduce((s, l) => s + l.excluded.length, 0);
  const note = `${included} eligible and ${excluded} excluded movements for ${period.start} to ${period.end}.`;

  if (existing) {
    existing.lines = lines;
    existing.unitMode = draft.settings.payUnitMode;
    existing.rates = { ...draft.settings.payRates };
    existing.currency = draft.settings.currency;
    existing.history.push({ at: now, by: actor.name, action: "Draft regenerated", note: `${note} Adjustments preserved.` });
    logAudit(draft, {
      action: "Pay Draft Regenerated",
      module: "Payments",
      entityId: existing.id,
      description: `Regenerated ${existing.id} (${formatDate(period.start)} - ${formatDate(period.end)}). ${note}`,
    });
    return { ok: true, id: existing.id, regenerated: true };
  }

  const id = nextId(draft, "payrun", "PAY-", 3);
  const run: PayRun = {
    id,
    periodStart: period.start,
    periodEnd: period.end,
    status: "Draft",
    unitMode: draft.settings.payUnitMode,
    rates: { ...draft.settings.payRates },
    currency: draft.settings.currency,
    generatedAt: now,
    generatedBy: actor.name,
    lines,
    history: [{ at: now, by: actor.name, action: "Draft generated", note }],
  };
  draft.payRuns.unshift(run);
  logAudit(draft, {
    action: "Pay Draft Generated",
    module: "Payments",
    entityId: id,
    description: `Generated ${id} for ${formatDate(period.start)} - ${formatDate(period.end)}. ${note}`,
  });
  return { ok: true, id, regenerated: false };
}

/** Set the (signed) adjustment for one driver while the run is a Draft. */
export function setPayAdjustment(
  draft: DB,
  runId: string,
  driverId: string,
  amount: number,
  note: string,
): MutationResult {
  const actor = actorOf(draft);
  if (!can(actor.role, "payments.manage")) return { ok: false, error: "Your role cannot edit pay drafts." };
  const run = draft.payRuns.find((r) => r.id === runId);
  if (!run) return { ok: false, error: "Pay run not found." };
  if (run.status !== "Draft") return { ok: false, error: "Approved pay runs are immutable." };
  const line = run.lines.find((l) => l.driverId === driverId);
  if (!line) return { ok: false, error: "Driver not found in this pay run." };
  if (!Number.isFinite(amount)) return { ok: false, error: "Adjustment must be a number." };
  if (amount !== 0 && !note.trim()) return { ok: false, error: "An adjustment note is required." };
  const before = line.adjustments;
  line.adjustments = round2(amount);
  line.adjustmentNote = amount === 0 ? "" : note.trim();
  line.total = round2(line.baseAmount + line.adjustments);
  run.history.push({
    at: nowOf(draft),
    by: actor.name,
    action: "Adjustment added",
    note: `${line.driverName} (${line.driverId}): ${formatMoney(before, run.currency)} to ${formatMoney(line.adjustments, run.currency)}${line.adjustmentNote ? ` - ${line.adjustmentNote}` : ""}`,
  });
  logAudit(draft, {
    action: "Pay Adjustment",
    module: "Payments",
    entityId: run.id,
    financial: true,
    description: `Adjustment on ${run.id} for ${line.driverName}: ${formatMoney(line.adjustments, run.currency)} (${line.adjustmentNote || "cleared"}).`,
  });
  return { ok: true };
}

export function submitPayRun(draft: DB, runId: string, note = ""): MutationResult {
  const actor = actorOf(draft);
  if (!can(actor.role, "payments.manage")) return { ok: false, error: "Your role cannot submit pay drafts." };
  const run = draft.payRuns.find((r) => r.id === runId);
  if (!run) return { ok: false, error: "Pay run not found." };
  if (run.status !== "Draft") return { ok: false, error: "Only Draft pay runs can be submitted." };
  if (!run.lines.length) return { ok: false, error: "There are no driver lines to submit." };
  run.history.push({
    at: nowOf(draft),
    by: actor.name,
    action: "Submitted",
    note: note.trim() || "Reviewed driver breakdowns; submitted for approval.",
  });
  logAudit(draft, { action: "Pay Run Submitted", module: "Payments", entityId: run.id, description: `${run.id} submitted for approval.` });
  notify(draft, {
    title: "Pay run awaiting Manager approval",
    body: `${actor.name} submitted ${run.id} (${formatDate(run.periodStart)} - ${formatDate(run.periodEnd)}, ${formatMoney(round2(run.lines.reduce((s, l) => s + l.total, 0)), run.currency)}) for approval.`,
    level: "info",
    href: `/payments/${run.id}`,
  });
  return { ok: true };
}

/** Simulated approval - `payments.approve` only. An Approved run is immutable. */
export function approvePayRun(draft: DB, runId: string, note = ""): MutationResult {
  const actor = actorOf(draft);
  if (!can(actor.role, "payments.approve")) return { ok: false, error: "Only the Manager can approve pay runs." };
  const run = draft.payRuns.find((r) => r.id === runId);
  if (!run) return { ok: false, error: "Pay run not found." };
  if (run.status !== "Draft") return { ok: false, error: "This pay run is already approved." };
  if (!isSubmitted(run)) return { ok: false, error: "Submit the draft for approval before approving it." };
  const now = nowOf(draft);
  run.status = "Approved";
  run.approvedAt = now;
  run.approvedBy = actor.name;
  const total = run.lines.reduce((s, l) => s + l.total, 0);
  run.history.push({ at: now, by: actor.name, action: "Approved", note: note.trim() || "Simulated approval (demo)." });
  logAudit(draft, {
    action: "Pay Run Approved",
    module: "Payments",
    entityId: run.id,
    financial: true,
    description: `Approved ${run.id} (${formatDate(run.periodStart)} - ${formatDate(run.periodEnd)}), ${run.lines.length} drivers, total ${formatMoney(round2(total), run.currency)} (simulated).`,
  });
  notify(draft, { title: "Pay run approved", body: `${run.id} approved by ${actor.name} (simulated).`, level: "success", href: `/payments/${run.id}` });
  return { ok: true };
}

/** Reopen an Approved pay run as a Draft (with a reason). `payments.approve` only; it must be re-submitted and re-approved. */
export function reopenPayRun(draft: DB, runId: string, reason: string): MutationResult {
  const actor = actorOf(draft);
  if (!can(actor.role, "payments.approve")) return { ok: false, error: "Only a Manager can reopen approved pay runs." };
  const run = draft.payRuns.find((r) => r.id === runId);
  if (!run) return { ok: false, error: "Pay run not found." };
  if (run.status !== "Approved") return { ok: false, error: "Only Approved pay runs can be reopened." };
  if (!reason.trim()) return { ok: false, error: "A reason is required to reopen an approved pay run." };
  run.status = "Draft";
  run.approvedAt = undefined;
  run.approvedBy = undefined;
  run.history.push({ at: nowOf(draft), by: actor.name, action: "Reopened", note: reason.trim() });
  logAudit(draft, {
    action: "Pay Run Reopened",
    module: "Payments",
    entityId: run.id,
    financial: true,
    description: `${run.id} reopened as a Draft by ${actor.name}: ${reason.trim()}`,
  });
  notify(draft, { title: "Pay run reopened", body: `${run.id} was reopened and is a live Draft again.`, level: "warning", href: `/payments/${run.id}` });
  return { ok: true };
}

export interface PayRequest {
  run: PayRun;
  submittedBy: string;
  submittedAt: string;
  note: string;
  total: number;
}

/** Pay runs that have been submitted for approval and are waiting for a Manager. */
export function pendingPayRequests(db: DB): PayRequest[] {
  const out: PayRequest[] = [];
  for (const run of db.payRuns) {
    if (!isSubmitted(run)) continue;
    const ev = [...run.history].reverse().find((h) => h.action === "Submitted");
    if (!ev) continue;
    out.push({ run, submittedBy: ev.by, submittedAt: ev.at, note: ev.note, total: round2(run.lines.reduce((s, l) => s + l.total, 0)) });
  }
  return out.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
}
