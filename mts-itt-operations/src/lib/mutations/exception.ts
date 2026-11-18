import type { DB } from "@/types/db";
import type { ExceptionRecord } from "@/types/exception";
import type { Movement } from "@/types/movement";
import { actorOf, logAudit, nextId, notify, nowOf } from "../db-helpers";
import { approveMovementCorrection, makeEvent, updateMovement, type MovementInput } from "./movement";

export type MutationResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isClosed = (e: ExceptionRecord) => e.status === "Resolved" || e.status === "Rejected";
const isManagerRole = (db: DB) => {
  const r = actorOf(db).role;
  return r === "Manager";
};

function find(db: DB, id: string) {
  return db.exceptions.find((e) => e.id === id);
}

function movementOf(db: DB, e: ExceptionRecord): Movement | undefined {
  return db.movements.find((m) => m.id === e.movementId);
}

/** Resolved material exceptions that still await manager approval for a movement. */
export function awaitingApproval(db: DB, movementId: string): ExceptionRecord[] {
  return db.exceptions.filter((e) => e.movementId === movementId && e.status === "Resolved" && e.materialCorrection && e.managerApproved === false);
}

export function assignException(db: DB, id: string, assignee: string | null): MutationResult {
  const e = find(db, id);
  if (!e) return fail("Exception not found");
  if (isClosed(e)) return fail("Closed exceptions cannot be reassigned");
  const prev = e.assignedTo;
  e.assignedTo = assignee;
  e.comments.push({ id: nextId(db, "comment", "C-", 5), by: actorOf(db).name, at: nowOf(db), text: assignee ? `Assigned to ${assignee}.` : "Assignment cleared." });
  logAudit(db, {
    action: "Exception Assigned",
    module: "Exceptions",
    description: `${e.id} (${e.type}) ${assignee ? `assigned to ${assignee}` : "unassigned"}${prev ? ` (was ${prev})` : ""}.`,
    entityId: e.id,
  });
  return { ok: true, value: undefined };
}

export function startReview(db: DB, id: string): MutationResult {
  const e = find(db, id);
  if (!e) return fail("Exception not found");
  if (e.status !== "Open") return fail("Only open exceptions can be moved to review");
  const actor = actorOf(db);
  e.status = "Under Review";
  if (!e.assignedTo) e.assignedTo = actor.name;
  e.comments.push({ id: nextId(db, "comment", "C-", 5), by: actor.name, at: nowOf(db), text: "Review started." });
  const m = movementOf(db, e);
  if (m) m.events.push(makeEvent(db, "reconciliation", `${e.id} (${e.type}) moved to review by ${actor.name}.`));
  logAudit(db, { action: "Exception Review Started", module: "Exceptions", description: `${e.id} (${e.type}) on ${e.movementId} moved to Under Review.`, entityId: e.id });
  return { ok: true, value: undefined };
}

export function addComment(db: DB, id: string, text: string): MutationResult {
  const e = find(db, id);
  if (!e) return fail("Exception not found");
  const t = text.trim();
  if (!t) return fail("Comment cannot be empty");
  e.comments.push({ id: nextId(db, "comment", "C-", 5), by: actorOf(db).name, at: nowOf(db), text: t });
  logAudit(db, { action: "Exception Comment", module: "Exceptions", description: `Comment added to ${e.id}: ${t.slice(0, 120)}`, entityId: e.id });
  return { ok: true, value: undefined };
}

/** Correct the related movement from inside an exception (uses updateMovement so material rules + audit apply). */
export function correctMovementFromException(db: DB, id: string, patch: Partial<MovementInput>, reason: string): MutationResult<{ changes: string[]; needsApproval: boolean }> {
  const e = find(db, id);
  if (!e) return fail("Exception not found");
  if (isClosed(e)) return fail("Closed exceptions cannot be used to correct the movement");
  if (!reason.trim()) return fail("A correction reason is required");
  const res = updateMovement(db, e.movementId, patch, `${reason.trim()} (via ${e.id})`);
  if (!res) return fail("Related movement not found");
  if (!res.changes.length) return fail("No changes were made to the movement");
  e.comments.push({
    id: nextId(db, "comment", "C-", 5),
    by: actorOf(db).name,
    at: nowOf(db),
    text: `Corrected ${e.movementId}: ${res.changes.join("; ")}. Reason: ${reason.trim()}${res.needsApproval ? " – awaiting manager approval." : ""}`,
  });
  if (res.needsApproval) {
    notify(db, { title: "Correction awaiting approval", body: `${e.movementId} was corrected via ${e.id} and needs manager approval.`, level: "warning", href: `/exceptions/${e.id}` });
  }
  return { ok: true, value: { changes: res.changes, needsApproval: res.needsApproval } };
}

export function resolveException(db: DB, id: string, note: string): MutationResult<{ needsApproval: boolean }> {
  const e = find(db, id);
  if (!e) return fail("Exception not found");
  if (e.status !== "Under Review") return fail("Start the review before resolving");
  if (!note.trim()) return fail("A resolution note is required");
  const actor = actorOf(db);
  const now = nowOf(db);
  const manager = isManagerRole(db);
  const needsApproval = e.materialCorrection && db.settings.requireManagerApproval && !manager;
  e.status = "Resolved";
  e.resolvedBy = actor.name;
  e.resolvedAt = now;
  e.resolutionNote = note.trim();
  if (e.materialCorrection) {
    e.managerApproved = !needsApproval;
    if (!needsApproval) {
      e.managerApprovedBy = actor.name;
      e.managerApprovedAt = now;
    }
  }
  e.comments.push({ id: nextId(db, "comment", "C-", 5), by: actor.name, at: now, text: `Resolved: ${note.trim()}` });
  const m = movementOf(db, e);
  if (m) {
    if (needsApproval) m.pendingApproval = true;
    m.updatedAt = now;
    m.events.push(makeEvent(db, "reconciliation", `${e.id} (${e.type}) resolved by ${actor.name}.${needsApproval ? " Material correction held for manager approval – billing blocked." : ""}`));
  }
  logAudit(db, {
    action: "Exception Resolved",
    module: "Exceptions",
    description: `${e.id} (${e.type}) on ${e.movementId} resolved. ${note.trim()}${needsApproval ? " [awaiting manager approval]" : ""}`,
    entityId: e.id,
    financial: e.materialCorrection,
  });
  if (needsApproval) notify(db, { title: "Material correction awaiting approval", body: `${e.id} on ${e.movementId} was resolved and needs manager approval before billing.`, level: "warning", href: `/exceptions/${e.id}` });
  return { ok: true, value: { needsApproval } };
}

export function rejectException(db: DB, id: string, reason: string): MutationResult {
  const e = find(db, id);
  if (!e) return fail("Exception not found");
  if (e.status !== "Under Review") return fail("Start the review before rejecting");
  if (!reason.trim()) return fail("A rejection reason is required");
  const actor = actorOf(db);
  const now = nowOf(db);
  e.status = "Rejected";
  e.rejectReason = reason.trim();
  e.resolvedBy = actor.name;
  e.resolvedAt = now;
  e.comments.push({ id: nextId(db, "comment", "C-", 5), by: actor.name, at: now, text: `Rejected: ${reason.trim()}` });
  const m = movementOf(db, e);
  if (m) {
    m.updatedAt = now;
    m.events.push(makeEvent(db, "reconciliation", `${e.id} (${e.type}) rejected by ${actor.name}: ${reason.trim()}`));
  }
  logAudit(db, {
    action: "Exception Rejected",
    module: "Exceptions",
    description: `${e.id} (${e.type}) on ${e.movementId} rejected: ${reason.trim()}`,
    entityId: e.id,
    financial: e.materialCorrection,
  });
  return { ok: true, value: undefined };
}

/** Manager approval of a resolved, financially material exception. Releases the movement hold once none remain. */
export function approveException(db: DB, id: string, note: string): MutationResult {
  const e = find(db, id);
  if (!e) return fail("Exception not found");
  if (e.status !== "Resolved" || e.managerApproved !== false) return fail("This exception is not awaiting approval");
  if (!isManagerRole(db)) return fail("Only a manager can approve material corrections");
  const actor = actorOf(db);
  e.managerApproved = true;
  e.managerApprovedBy = actor.name;
  e.managerApprovedAt = nowOf(db);
  e.comments.push({ id: nextId(db, "comment", "C-", 5), by: actor.name, at: nowOf(db), text: `Manager approval granted.${note.trim() ? ` ${note.trim()}` : ""}` });
  logAudit(db, {
    action: "Material Correction Approved",
    module: "Exceptions",
    description: `Manager approved ${e.id} (${e.type}) on ${e.movementId}. ${note.trim()}`.trim(),
    entityId: e.id,
    financial: true,
  });
  const m = movementOf(db, e);
  if (m && m.pendingApproval && awaitingApproval(db, m.id).length === 0) approveMovementCorrection(db, m.id, `Released with ${e.id}. ${note.trim()}`.trim());
  return { ok: true, value: undefined };
}
