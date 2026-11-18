import type { DB } from "@/types/db";
import type { Movement, MovementEvent, MovementStatus } from "@/types/movement";
import type { ContainerSize, TerminalCode } from "@/types/terminal";
import { actorOf, logAudit, nextId, nowOf } from "../db-helpers";
import { detectIssues, raiseExceptions, scanMissingEvidence } from "../reconciliation";
import { demoToday } from "../date-utils";

export interface MovementInput {
  containerNos: string[];
  containerSize: ContainerSize;
  sourceTerminal: TerminalCode;
  destinationTerminal: TerminalCode;
  primeMoverId: string | null;
  trailerId: string | null;
  driverId: string | null;
  loadingAt: string | null;
  dischargeAt: string | null;
  status: MovementStatus;
  notes: string;
  origin?: Movement["origin"];
  importId?: string;
  sourceRowNo?: number;
}

export function makeEvent(db: DB, kind: MovementEvent["kind"], text: string, by?: string): MovementEvent {
  return { id: nextId(db, "event", "EV-", 6), at: nowOf(db), by: by ?? actorOf(db).name, kind, text };
}

/** Validate the one-trailer / two-20FT journey rule. Returns an error message or null. */
export function validateJourney(size: ContainerSize, containerNos: string[]): string | null {
  const n = containerNos.filter(Boolean).length;
  if (n === 0) return "At least one container number is required.";
  if (size === "40FT" && n > 1) return "A 40FT journey carries exactly one container.";
  if (size === "20FT" && n > 2) return "A trailer can carry at most two 20FT containers.";
  if (new Set(containerNos).size !== containerNos.length) return "Container numbers must be different.";
  return null;
}

export function createMovement(db: DB, input: MovementInput): Movement {
  const actor = actorOf(db);
  const now = nowOf(db);
  const m: Movement = {
    ...input,
    origin: input.origin ?? "Manual",
    id: nextId(db, "movement", "MV-", 4),
    createdAt: now,
    createdBy: actor.name,
    updatedAt: now,
    pendingApproval: false,
    events: [],
  };
  m.events.push(
    makeEvent(
      db,
      input.origin === "Import" ? "import" : "created",
      input.origin === "Import"
        ? `Created from terminal import ${input.importId ?? ""} (row ${input.sourceRowNo ?? "?"}).`
        : `Movement registered manually by ${actor.name}.`,
    ),
  );
  db.movements.unshift(m);
  const issues = detectIssues(m, db);
  const raised = raiseExceptions(db, m, issues, actor, input.importId);
  if (raised.length) m.events.push(makeEvent(db, "reconciliation", `Reconciliation raised ${raised.length} exception(s): ${raised.map((r) => r.id).join(", ")}.`));
  else m.events.push(makeEvent(db, "reconciliation", "Reconciliation passed – no discrepancies detected."));
  if (input.origin !== "Import") {
    logAudit(db, {
      action: "Movement Created",
      module: "Movements",
      description: `Registered ${m.id} (${m.containerNos.join(" + ")}) ${m.sourceTerminal} → ${m.destinationTerminal}.`,
      entityId: m.id,
    });
  }
  return m;
}

const MATERIAL_FIELDS: (keyof Movement)[] = ["containerNos", "containerSize", "sourceTerminal", "destinationTerminal", "status", "driverId"];

function fmt(v: unknown): string {
  if (Array.isArray(v)) return v.join(" + ") || "—";
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

/** Apply an edit. Financially material changes by non-managers are held for manager approval. */
export function updateMovement(
  db: DB,
  id: string,
  patch: Partial<MovementInput>,
  reason: string,
): { movement: Movement; changes: string[]; needsApproval: boolean } | null {
  const m = db.movements.find((x) => x.id === id);
  if (!m) return null;
  const actor = actorOf(db);
  const changes: string[] = [];
  let material = false;
  for (const key of Object.keys(patch) as (keyof MovementInput)[]) {
    const next = patch[key];
    const prev = m[key as keyof Movement];
    if (JSON.stringify(prev) === JSON.stringify(next)) continue;
    changes.push(`${key}: ${fmt(prev)} → ${fmt(next)}`);
    (m as unknown as Record<string, unknown>)[key] = next;
    if (MATERIAL_FIELDS.includes(key as keyof Movement)) material = true;
  }
  if (!changes.length) return { movement: m, changes, needsApproval: false };
  const isManager = actor.role === "Manager";
  const needsApproval = material && db.settings.requireManagerApproval && !isManager;
  if (needsApproval) m.pendingApproval = true;
  m.updatedAt = nowOf(db);
  m.events.push(makeEvent(db, "edited", `${changes.join("; ")}${reason ? ` — Reason: ${reason}` : ""}`));
  if (needsApproval) m.events.push(makeEvent(db, "approval", "Financially material correction held for manager approval. Billing blocked."));
  raiseExceptions(db, m, detectIssues(m, db), actor);
  logAudit(db, {
    action: material ? "Movement Corrected (material)" : "Movement Edited",
    module: "Movements",
    description: `${m.id}: ${changes.join("; ")}${reason ? ` — ${reason}` : ""}${needsApproval ? " [awaiting manager approval]" : ""}`,
    entityId: m.id,
    financial: material,
  });
  return { movement: m, changes, needsApproval };
}

export function approveMovementCorrection(db: DB, id: string, note: string): boolean {
  const m = db.movements.find((x) => x.id === id);
  if (!m || !m.pendingApproval) return false;
  m.pendingApproval = false;
  m.updatedAt = nowOf(db);
  m.events.push(makeEvent(db, "approval", `Correction approved by manager. ${note}`.trim()));
  logAudit(db, {
    action: "Correction Approved",
    module: "Movements",
    description: `Manager approved financially material correction on ${m.id}. ${note}`.trim(),
    entityId: m.id,
    financial: true,
  });
  return true;
}

export function runEvidenceReconciliation(db: DB): number {
  const created = scanMissingEvidence(db, demoToday(), actorOf(db));
  logAudit(db, {
    action: "Reconciliation Run",
    module: "Exceptions",
    description: `Evidence reconciliation scan raised ${created.length} new exception(s).`,
  });
  return created.length;
}
