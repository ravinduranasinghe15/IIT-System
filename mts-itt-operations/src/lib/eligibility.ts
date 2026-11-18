import type { DB } from "@/types/db";
import type { BillableStatus, Movement } from "@/types/movement";
import type { UnitMode } from "@/types/payment";
import { operationalDay } from "./date-utils";
import { hasVerifiedDriverLog } from "./driver-logs";
import { unreviewedMismatches } from "./cross-check";

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

/** True when the movement has a VERIFIED loading chit AND a VERIFIED discharge chit. */
export function hasVerifiedChits(db: DB, movementId: string): boolean {
  const docs = db.documents.filter((d) => d.movementId === movementId && d.ocr?.verified);
  return docs.some((d) => d.docType === "Loading Chit") && docs.some((d) => d.docType === "Discharge Chit");
}

/**
 * Derived – never stored – so billable state can never drift from exception, chit or approval state.
 * A movement only becomes Billable once its status allows billing, both chits are verified and its driver log sheet is verified
 * (see driver-logs.ts; legacy seed movements are exempt).
 */
/** Chits verified AND the movement's driver log sheet verified: "Pending Chits" / "Pending Driver Log" otherwise. */
function evidenceStatus(m: Movement, db: DB): BillableStatus {
  if (!hasVerifiedChits(db, m.id)) return "Pending Chits";
  if (!hasVerifiedDriverLog(db, m)) return "Pending Driver Log";
  // compare everything before billing: documents the system verified by itself must agree with the terminal data, the
  // roster and each other; a mismatch has to be reviewed (verified) by a person first
  return unreviewedMismatches(db, m).length ? "Blocked – Mismatch" : "Billable";
}

export function billableStatus(m: Movement, db: DB): BillableStatus {
  if (unresolvedExceptionsFor(db, m.id).length > 0) return "Blocked – Exception";
  if (m.pendingApproval) return "Pending Approval";
  switch (m.status) {
    case "Completed":
      return evidenceStatus(m, db);
    case "Rejected":
      if (!db.settings.billRejected) return "Non-billable";
      return evidenceStatus(m, db);
    case "Damaged":
      if (!db.settings.billDamaged) return "Non-billable";
      return evidenceStatus(m, db);
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
