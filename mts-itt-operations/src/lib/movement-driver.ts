import type { DB } from "@/types/db";
import type { EvidenceDoc } from "@/types/evidence";
import type { Movement } from "@/types/movement";
import { logAudit, nextId, nowOf } from "./db-helpers";
import { makeEvent } from "./mutations/movement";
import { movementsCovered, rosterDriverFor } from "./driver-logs";

/**
 * Who drove a movement. Drivers are not tied to a truck: the terminal report only names the truck, so the driver comes
 *  1. from the verified driver log sheet (what really happened) – always wins, otherwise
 *  2. from the roster (who was scheduled on that truck for that date and shift).
 */

/**
 * "Driver Information Missing" is raised when a movement is created without a driver. Once a driver is found (roster or a
 * verified driver log) there is nothing left to review, so the exception closes itself and stops blocking billing.
 */
function closeDriverMissing(db: DB, m: Movement, how: string) {
  const open = db.exceptions.filter((e) => e.movementId === m.id && e.type === "Driver Information Missing" && (e.status === "Open" || e.status === "Under Review"));
  if (!open.length) return;
  const now = nowOf(db);
  const by = "System (auto)";
  for (const e of open) {
    e.status = "Resolved";
    e.resolvedBy = by;
    e.resolvedAt = now;
    e.resolutionNote = `Driver found: ${how}.`;
    e.comments.push({ id: nextId(db, "comment", "C-", 5), by, at: now, text: `Resolved automatically: ${how}.` });
    m.events.push(makeEvent(db, "reconciliation", `${e.id} (Driver Information Missing) resolved automatically: ${how}.`, by));
    logAudit(db, { action: "Exception Resolved (auto)", module: "Exceptions", description: `${e.id} on ${m.id} closed automatically – ${how}.`, entityId: e.id });
  }
}

const drvLabel = (db: DB, id: string) => db.drivers.find((d) => d.id === id)?.name ?? id;

/** Fills the driver of movements that have none (or whose driver came from the roster) from the current roster. */
export function refreshMovementDrivers(db: DB, only?: string[]): number {
  let changed = 0;
  for (const m of db.movements) {
    if (only && !only.includes(m.id)) continue;
    if (m.driverSource === "driver log" || m.driverSource === "manual") continue;
    if (m.driverId && !m.driverSource) continue; // entered by hand before sources were tracked
    const id = rosterDriverFor(db, m.primeMoverId, m.loadingAt);
    if (id && id !== m.driverId) {
      m.driverId = id;
      m.driverSource = "roster";
      closeDriverMissing(db, m, `${drvLabel(db, id)} is on the roster for this truck and shift`);
      changed++;
    }
  }
  return changed;
}

/** A verified driver log names the real driver: movements it covers take that driver, and a difference is recorded. */
export function applyLogDriver(db: DB, doc: EvidenceDoc): number {
  const logDriver = doc.driverLog?.driverId;
  if (doc.docType !== "Driver Log Sheet" || !doc.ocr?.verified || !logDriver) return 0;
  const name = (id: string | null) => (id ? (db.drivers.find((d) => d.id === id)?.name ?? id) : "none");
  let changed = 0;
  for (const m of movementsCovered(db, doc) as Movement[]) {
    if (m.driverId === logDriver) {
      m.driverSource = "driver log";
      continue;
    }
    const before = m.driverId;
    m.driverId = logDriver;
    m.driverSource = "driver log";
    closeDriverMissing(db, m, `${name(logDriver)} named on verified driver log ${doc.id}`);
    m.events.push(makeEvent(db, "document", `Driver set from verified driver log ${doc.id}: ${name(logDriver)}${before ? ` (the roster had ${name(before)})` : ""}.`));
    changed++;
  }
  return changed;
}
