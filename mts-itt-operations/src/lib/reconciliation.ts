import type { DB } from "@/types/db";
import type { Movement } from "@/types/movement";
import type { ExceptionConflict, ExceptionPriority, ExceptionRecord, ExceptionType } from "@/types/exception";
import type { AppUser } from "@/types/user";
import { movementDay } from "./eligibility";
import { nextId, nowOf, notify } from "./db-helpers";
import { operationalDay } from "./date-utils";

export interface DetectedIssue {
  type: ExceptionType;
  priority: ExceptionPriority;
  description: string;
  conflicts: ExceptionConflict[];
}

export const PRIORITY_BY_TYPE: Record<ExceptionType, ExceptionPriority> = {
  "Missing Loading Chit": "Medium",
  "Missing Discharge Chit": "Medium",
  "Container Number Mismatch": "High",
  "Destination Mismatch": "High",
  "Truck Number Mismatch": "High",
  "Driver Information Missing": "Medium",
  "Duplicate Movement": "High",
  "Rejected Delivery": "High",
  "Damaged Container": "Critical",
  "Missing Arrival Time": "Low",
};

/** Rule-based reconciliation of one movement against master data and the rest of the ledger. */
export function detectIssues(m: Movement, db: DB, opts: { checkEvidence?: boolean } = {}): DetectedIssue[] {
  const out: DetectedIssue[] = [];
  const add = (type: ExceptionType, description: string, conflicts: ExceptionConflict[] = [], priority = PRIORITY_BY_TYPE[type]) =>
    out.push({ type, description, conflicts, priority });

  if (m.status === "Rejected")
    add("Rejected Delivery", "Delivery rejected at destination terminal. Evidence and route history retained for review.");
  if (m.status === "Damaged")
    add("Damaged Container", "Container reported damaged. Evidence and history retained for claims review.");

  if (!m.driverId)
    add("Driver Information Missing", "No driver recorded for this movement; source report omitted driver details.", [
      { field: "Driver", systemValue: "—", sourceValue: "Not provided" },
    ]);

  if (!m.primeMoverId) {
    add("Truck Number Mismatch", "No prime mover recorded for this movement.", [
      { field: "Prime Mover", systemValue: "—", sourceValue: "Not provided" },
    ]);
  } else if (!db.primeMovers.some((p) => p.id === m.primeMoverId)) {
    add("Truck Number Mismatch", `Truck ${m.primeMoverId} is not registered in the fleet master data.`, [
      { field: "Prime Mover", systemValue: "Not registered", sourceValue: m.primeMoverId },
    ]);
  }

  if (["Completed", "Rejected", "Damaged"].includes(m.status) && !m.dischargeAt)
    add("Missing Arrival Time", `Status is ${m.status} but no discharge/arrival time is recorded.`, [
      { field: "Discharge Time", systemValue: "—", sourceValue: "Blank" },
    ]);

  const route = db.routes.find((r) => r.source === m.sourceTerminal && r.destination === m.destinationTerminal);
  if (!route || route.status === "Inactive")
    add("Destination Mismatch", `No active route configured for ${m.sourceTerminal} → ${m.destinationTerminal}.`, [
      { field: "Route", systemValue: "No active route", sourceValue: `${m.sourceTerminal}-${m.destinationTerminal}` },
    ]);

  const day = movementDay(m, db.settings.opDayStartHour);
  for (const cn of m.containerNos) {
    const dup = db.movements.find(
      (o) =>
        o.id !== m.id &&
        o.containerNos.includes(cn) &&
        o.sourceTerminal === m.sourceTerminal &&
        movementDay(o, db.settings.opDayStartHour) === day &&
        o.id < m.id,
    );
    if (dup) {
      add("Duplicate Movement", `Container ${cn} already recorded on ${dup.id} for the same source terminal and operational day.`, [
        { field: "Existing movement", systemValue: dup.id, sourceValue: m.id },
      ]);
      break;
    }
  }

  if (opts.checkEvidence && m.status === "Completed") {
    const docs = db.documents.filter((d) => d.movementId === m.id);
    if (!docs.some((d) => d.docType === "Loading Chit")) add("Missing Loading Chit", "No loading chit has been attached to this completed movement.");
    if (!docs.some((d) => d.docType === "Discharge Chit")) add("Missing Discharge Chit", "No discharge chit has been attached to this completed movement.");
  }
  return out;
}

/** Create exception records for issues not already tracked for this movement. Returns the number created. */
export function raiseExceptions(
  db: DB,
  m: Movement,
  issues: DetectedIssue[],
  actor: AppUser,
  importId?: string,
): ExceptionRecord[] {
  const created: ExceptionRecord[] = [];
  for (const issue of issues) {
    const exists = db.exceptions.some(
      (e) => e.movementId === m.id && e.type === issue.type && e.status !== "Rejected" && e.status !== "Resolved",
    );
    const resolvedBefore = db.exceptions.some((e) => e.movementId === m.id && e.type === issue.type && e.status === "Resolved");
    if (exists || resolvedBefore) continue;
    const rec: ExceptionRecord = {
      id: nextId(db, "exception", "EX-", 4),
      movementId: m.id,
      containerNo: m.containerNos[0] ?? "—",
      type: issue.type,
      sourceTerminal: m.sourceTerminal,
      priority: issue.priority,
      reportedAt: nowOf(db),
      assignedTo: null,
      status: "Open",
      description: issue.description,
      conflicts: issue.conflicts,
      comments: [],
      importId,
      materialCorrection: ["Container Number Mismatch", "Destination Mismatch", "Duplicate Movement", "Rejected Delivery", "Damaged Container"].includes(issue.type),
    };
    db.exceptions.unshift(rec);
    created.push(rec);
  }
  if (created.length) {
    const crit = created.find((c) => c.priority === "Critical");
    notify(db, {
      title: crit ? "Critical exception raised" : "New exception(s) raised",
      body: `${created.length} exception(s) raised for ${m.id} (${created.map((c) => c.type).join(", ")}). Billing is blocked until resolved.`,
      level: crit ? "critical" : "warning",
      href: `/exceptions/${created[0].id}`,
    });
  }
  void actor;
  return created;
}

/** Scan completed movements older than the current operational day for missing chits. */
export function scanMissingEvidence(db: DB, today: string, actor: AppUser): ExceptionRecord[] {
  const created: ExceptionRecord[] = [];
  for (const m of db.movements) {
    const t = m.dischargeAt ?? m.loadingAt;
    if (!t || m.status !== "Completed") continue;
    if (operationalDay(t, db.settings.opDayStartHour) >= today) continue;
    const issues = detectIssues(m, db, { checkEvidence: true }).filter(
      (i) => i.type === "Missing Loading Chit" || i.type === "Missing Discharge Chit",
    );
    created.push(...raiseExceptions(db, m, issues, actor));
  }
  return created;
}
