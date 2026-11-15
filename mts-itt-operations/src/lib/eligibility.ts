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

/**
 * Driver pay rule: a movement is paid only when its status is Completed AND its billable status is Billable
 * (so no unresolved exception and no correction awaiting approval), and a driver is recorded.
 */
export function payEligibility(m: Movement, db: DB): { eligible: boolean; reason?: string } {
  if (m.status !== "Completed") return { eligible: false, reason: `Not completed (${m.status})` };
  const billable = billableStatus(m, db);
  if (billable !== "Billable") return { eligible: false, reason: `Not billable (${billable})` };
  if (!m.driverId) return { eligible: false, reason: "No driver recorded" };
  return { eligible: true };
}

export function invoiceEligibility(m: Movement, db: DB): { eligible: boolean; reason?: string } {
  const s = billableStatus(m, db);
  if (s === "Billable") return { eligible: true };
  return { eligible: false, reason: s };
}
