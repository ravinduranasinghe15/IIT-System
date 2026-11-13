import type { DB } from "@/types/db";
import type { BillableStatus, Movement } from "@/types/movement";
import type { UnitMode } from "@/types/payment";
import { operationalDay } from "./date-utils";

/** Number of billable/payable units for a movement. A trailer with 2 x 20FT is ONE journey but may be 1 or 2 units. */
export function unitsFor(m: Movement, mode: UnitMode): number {
  return mode === "per-trailer" ? 1 : Math.max(1, m.containerNos.length);
}

export function movementTime(m: Movement): string | null {
  return m.loadingAt ?? m.dischargeAt;
}

/** Reporting day (07:00→07:00) a movement is counted in. */
export function movementDay(m: Movement, startHour = 7): string | null {
  const t = movementTime(m);
  return t ? operationalDay(t, startHour) : null;
}

export function unresolvedExceptionsFor(db: DB, movementId: string) {
  return db.exceptions.filter(
    (e) => e.movementId === movementId && (e.status === "Open" || e.status === "Under Review"),
  );
}

/** Derived – never stored – so billable state can never drift from exception state. */
export function billableStatus(m: Movement, db: DB): BillableStatus {
  if (unresolvedExceptionsFor(db, m.id).length > 0) return "Blocked – Exception";
  if (m.pendingApproval) return "Pending Approval";
  switch (m.status) {
    case "Completed":
      return "Billable";
    case "Rejected":
      return db.settings.billRejected ? "Billable" : "Non-billable";
    case "Damaged":
      return db.settings.billDamaged ? "Billable" : "Non-billable";
    default:
      return "Pending Completion";
  }
}

export function isBillable(m: Movement, db: DB): boolean {
  return billableStatus(m, db) === "Billable";
}

export function payEligibility(m: Movement, db: DB): { eligible: boolean; reason?: string } {
  if (unresolvedExceptionsFor(db, m.id).length > 0) return { eligible: false, reason: "Unresolved exception" };
  if (m.pendingApproval) return { eligible: false, reason: "Correction awaiting manager approval" };
  if (!m.driverId) return { eligible: false, reason: "No driver recorded" };
  if (m.status === "Completed") return { eligible: true };
  if (m.status === "Rejected") return db.settings.payRejected ? { eligible: true } : { eligible: false, reason: "Rejected delivery (pay rule: excluded)" };
  if (m.status === "Damaged") return db.settings.payDamaged ? { eligible: true } : { eligible: false, reason: "Damaged delivery (pay rule: excluded)" };
  return { eligible: false, reason: `Not completed (${m.status})` };
}

export function invoiceEligibility(m: Movement, db: DB): { eligible: boolean; reason?: string } {
  const s = billableStatus(m, db);
  if (s === "Billable") return { eligible: true };
  return { eligible: false, reason: s };
}
