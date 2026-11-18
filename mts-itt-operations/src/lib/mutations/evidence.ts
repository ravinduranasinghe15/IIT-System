import type { DB } from "@/types/db";
import type { DocType, DriverLogMeta, EvidenceDoc, OcrField } from "@/types/evidence";
import { actorOf, logAudit, nextId, nowOf } from "../db-helpers";
import { ledgerValueFor, sameValue, simulateExtraction } from "../ocr-sim";
import { makeEvent } from "./movement";
import { DEMO_CHIT_DIR, demoChitByName, demoDriverLogByName, type DemoChit } from "@/data/demo-chits";
import { logFieldsFromMeta } from "../driver-logs";
import { PRIORITY_BY_TYPE, raiseExceptions } from "../reconciliation";

/** Stored as a data URL only below this size – larger files keep metadata only (browser storage limits). */
export const MAX_DATA_URL_KB = 600;

export interface UploadInput {
  name: string;
  docType: DocType;
  mime: string;
  sizeKb: number;
  dataUrl?: string;
  movementId: string | null;
  driverLog?: DriverLogMeta;
}

/** Open exceptions of the "missing chit" kind that this document type could explain (never auto-resolved). */
function relatedMissingChitExceptions(db: DB, movementId: string | null, docType: DocType): string[] {
  if (!movementId) return [];
  const type = docType === "Loading Chit" ? "Missing Loading Chit" : docType === "Discharge Chit" ? "Missing Discharge Chit" : null;
  if (!type) return [];
  return db.exceptions.filter((e) => e.movementId === movementId && e.type === type && (e.status === "Open" || e.status === "Under Review")).map((e) => e.id);
}

function noteOnMovement(db: DB, movementId: string | null, text: string) {
  const m = movementId ? db.movements.find((x) => x.id === movementId) : null;
  if (m) m.events.push(makeEvent(db, "document", text));
}

export function uploadDocument(db: DB, input: UploadInput): { doc: EvidenceDoc; openExceptionIds: string[]; storedPreview: boolean } {
  const actor = actorOf(db);
  const now = nowOf(db);
  const storedPreview = !!input.dataUrl && input.sizeKb < MAX_DATA_URL_KB;
  const doc: EvidenceDoc = {
    id: nextId(db, "document", "DOC-", 4),
    name: input.name,
    docType: input.docType,
    mime: input.mime || "application/octet-stream",
    sizeKb: Math.max(1, Math.round(input.sizeKb)),
    uploadedAt: now,
    uploadedBy: actor.name,
    movementId: input.movementId,
    driverLog: input.driverLog,
    dataUrl: storedPreview ? input.dataUrl : undefined,
    history: [{ at: now, by: actor.name, action: input.movementId ? `Uploaded and linked to ${input.movementId}` : "Uploaded (not yet linked to a movement)" }],
  };
  if (!storedPreview) doc.history.push({ at: now, by: actor.name, action: "File larger than the browser-storage limit – metadata stored, preview unavailable after this session" });
  db.documents.unshift(doc);
  noteOnMovement(db, input.movementId, `${doc.docType} ${doc.id} (${doc.name}) attached by ${actor.name}.`);
  logAudit(db, {
    action: "Document Uploaded",
    module: "Evidence",
    description: `${doc.id} (${doc.docType}, ${doc.name}) uploaded${input.movementId ? ` and linked to ${input.movementId}` : ""}.`,
    entityId: doc.id,
  });
  completeIfChitsSubmitted(db, input.movementId);
  return { doc, openExceptionIds: relatedMissingChitExceptions(db, input.movementId, input.docType), storedPreview };
}

/**
 * Once a movement has BOTH a loading and a discharge chit submitted, an In Transit movement becomes Completed.
 * Billable status stays derived and still needs both chits verified (see eligibility.ts).
 */
export function completeIfChitsSubmitted(db: DB, movementId: string | null): boolean {
  const m = movementId ? db.movements.find((x) => x.id === movementId) : null;
  if (!m || m.status !== "In Transit") return false;
  const docs = db.documents.filter((d) => d.movementId === m.id);
  const discharge = docs.find((d) => d.docType === "Discharge Chit");
  if (!docs.some((d) => d.docType === "Loading Chit") || !discharge) return false;
  const t = discharge.ocr?.fields.find((x) => x.key === "datetime")?.value ?? "";
  const validTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t) && (!m.loadingAt || t.slice(0, 16) >= m.loadingAt.slice(0, 16));
  m.status = "Completed";
  if (validTime) m.dischargeAt = t.slice(0, 16);
  m.events.push(makeEvent(db, "document", `Loading and discharge chits submitted: status set to Completed. Billing still requires both chits to be verified.`));
  logAudit(db, { action: "Movement Completed (chits submitted)", module: "Evidence", description: `${m.id} set to Completed – loading and discharge chits are on file.`, entityId: m.id });
  return true;
}

/** Attach / re-link a document to a movement (or unlink with null). Does NOT resolve any exception. */
export function linkDocument(db: DB, docId: string, movementId: string | null): { ok: boolean; openExceptionIds: string[]; error?: string } {
  const doc = db.documents.find((d) => d.id === docId);
  if (!doc) return { ok: false, openExceptionIds: [], error: "Document not found" };
  if (movementId && !db.movements.some((m) => m.id === movementId)) return { ok: false, openExceptionIds: [], error: `Movement ${movementId} does not exist` };
  if (doc.movementId === movementId) return { ok: true, openExceptionIds: [] };
  const actor = actorOf(db);
  const previous = doc.movementId;
  doc.movementId = movementId;
  doc.history.push({
    at: nowOf(db),
    by: actor.name,
    action: movementId ? (previous ? `Re-linked from ${previous} to ${movementId}` : `Linked to ${movementId}`) : `Unlinked from ${previous}`,
  });
  if (previous) noteOnMovement(db, previous, `${doc.docType} ${doc.id} was unlinked from this movement by ${actor.name}.`);
  noteOnMovement(db, movementId, `${doc.docType} ${doc.id} (${doc.name}) attached by ${actor.name}.`);
  logAudit(db, {
    action: movementId ? "Document Linked" : "Document Unlinked",
    module: "Evidence",
    description: movementId ? `${doc.id} ${previous ? `re-linked from ${previous} to` : "linked to"} ${movementId}.` : `${doc.id} unlinked from ${previous}.`,
    entityId: doc.id,
  });
  completeIfChitsSubmitted(db, movementId);
  autoVerifyIfConfident(db, doc.id);
  return { ok: true, openExceptionIds: relatedMissingChitExceptions(db, movementId, doc.docType) };
}

export function changeDocType(db: DB, docId: string, docType: DocType): boolean {
  const doc = db.documents.find((d) => d.id === docId);
  if (!doc || doc.docType === docType) return false;
  const actor = actorOf(db);
  doc.history.push({ at: nowOf(db), by: actor.name, action: `Document type changed from ${doc.docType} to ${docType}` });
  logAudit(db, { action: "Document Type Changed", module: "Evidence", description: `${doc.id}: ${doc.docType} → ${docType}.`, entityId: doc.id });
  doc.docType = docType;
  return true;
}

/** Run the SIMULATED assisted extraction. Resets any previous verification. */
export function runExtraction(db: DB, docId: string): EvidenceDoc | null {
  const doc = db.documents.find((d) => d.id === docId);
  if (!doc) return null;
  const actor = actorOf(db);
  const now = nowOf(db);
  // The prepared demo chit pack has fixed, hard-coded extraction values; anything else uses the simulation.
  const demo = demoChitByName(doc.name) ?? demoDriverLogByName(doc.name);
  const logMeta = doc.docType === "Driver Log Sheet" ? doc.driverLog : undefined;
  const sim = demo || logMeta ? null : simulateExtraction(doc, db);
  const fields = demo ? demo.fields.map((f) => ({ ...f })) : logMeta ? logFieldsFromMeta(db, logMeta) : sim!.fields;
  const sourceMovement = sim?.sourceMovement ?? null;
  const inferred = sim?.inferred ?? false;
  const rerun = !!doc.ocr;
  doc.ocr = { fields, extractedAt: now, verified: false };
  // a discharge chit read after the movement was auto-completed supplies the missing discharge time
  const target = doc.docType === "Discharge Chit" && doc.movementId ? db.movements.find((x) => x.id === doc.movementId) : null;
  const stamp = fields.find((x) => x.key === "datetime")?.value ?? "";
  if (target && target.status === "Completed" && !target.dischargeAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(stamp) && (!target.loadingAt || stamp.slice(0, 16) >= target.loadingAt.slice(0, 16))) {
    target.dischargeAt = stamp.slice(0, 16);
  }
  doc.history.push({
    at: now,
    by: actor.name,
    action: `${rerun ? "Re-ran" : "Ran"} simulated assisted extraction${inferred && sourceMovement ? " (document not linked – demo values taken from a plausible movement)" : ""} – awaiting human verification`,
  });
  logAudit(db, {
    action: "Assisted Extraction Run (simulated)",
    module: "Evidence",
    description: `Simulated extraction (not real OCR) produced ${fields.length} field(s) for ${doc.id}; awaiting human verification.`,
    entityId: doc.id,
  });
  autoVerifyIfConfident(db, doc.id);
  return doc;
}

export const AUTO_VERIFIER = "System (auto)";

/** A chit's confidence score is its weakest field, so one doubtful field keeps it out of auto-verification. */
export function chitConfidence(doc: EvidenceDoc): number | null {
  const f = doc.ocr?.fields;
  return f && f.length ? Math.min(...f.map((x) => x.confidence)) : null;
}

/**
 * Loading / discharge chits and driver log sheets whose confidence score reaches the Settings threshold, are linked to a movement (logs: have their driver, lorry and shift filled in) and agree
 * with its ledger are verified automatically. Everything else stays "Needs Verification" for a person.
 */
export function autoVerifyIfConfident(db: DB, docId: string): boolean {
  const doc = db.documents.find((d) => d.id === docId);
  if (!doc?.ocr || doc.ocr.verified) return false;
  const isLog = doc.docType === "Driver Log Sheet";
  if (!isLog && doc.docType !== "Loading Chit" && doc.docType !== "Discharge Chit") return false;
  const m = doc.movementId ? db.movements.find((x) => x.id === doc.movementId) : null;
  const score = chitConfidence(doc);
  if (score === null || score < db.settings.ocrConfidenceThreshold) return false;
  // a log sheet is matched by driver / lorry / shift (not one movement), so it needs its header details instead
  if (isLog ? !doc.driverLog?.driverId || !doc.driverLog.primeMoverId : !m) return false;
  for (const f of doc.ocr.fields) {
    if (!m) break;
    const ledger = ledgerValueFor(f.key, m, doc, db);
    if (ledger !== null && ledger !== "" && f.value && !sameValue(f.value, ledger, f.key, db)) return false;
  }
  return verifyExtraction(db, docId, doc.ocr.fields, true).ok;
}

/** Human verification of (possibly corrected) extracted values. Never edits the movement. */
export function verifyExtraction(db: DB, docId: string, fields: OcrField[], auto = false): { ok: boolean; corrected: number; differences: string[] } {
  const doc = db.documents.find((d) => d.id === docId);
  if (!doc?.ocr) return { ok: false, corrected: 0, differences: [] };
  const actor = auto ? { ...actorOf(db), name: AUTO_VERIFIER } : actorOf(db);
  const now = nowOf(db);
  const original = doc.ocr.fields;
  const corrected = fields.filter((f) => {
    const o = original.find((x) => x.key === f.key);
    return o && o.value !== f.value;
  });
  const m = doc.movementId ? db.movements.find((x) => x.id === doc.movementId) : null;
  const differences: string[] = [];
  if (m) {
    for (const f of fields) {
      const ledger = ledgerValueFor(f.key, m, doc, db);
      if (ledger !== null && ledger !== "" && f.value && !sameValue(f.value, ledger, f.key, db)) differences.push(`${f.label}: chit '${f.value}' vs ledger '${ledger}'`);
    }
  }
  doc.ocr = { ...doc.ocr, fields: fields.map((f) => ({ ...f })), verified: true, verifiedBy: actor.name, verifiedAt: now };
  doc.history.push({
    at: now,
    by: actor.name,
    action: `${auto ? "Extraction auto-verified (confidence at or above threshold, matches ledger)" : "Extraction verified by human"}${corrected.length ? ` (${corrected.length} field(s) corrected: ${corrected.map((c) => c.label).join(", ")})` : " (no corrections)"}`,
  });
  // A verified discharge chit confirms delivery: an In Transit movement becomes Completed at the verified time.
  if (m && doc.docType === "Discharge Chit" && m.status === "In Transit") {
    const t = fields.find((x) => x.key === "datetime")?.value ?? "";
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t) && (!m.loadingAt || t.slice(0, 16) >= m.loadingAt.slice(0, 16))) {
      m.status = "Completed";
      m.dischargeAt = t.slice(0, 16);
      m.events.push(makeEvent(db, "document", `Delivery confirmed by verified discharge chit ${doc.id}: status set to Completed, discharged ${t.slice(0, 16).replace("T", " ")}.`));
    }
  }
  const containerClash = differences.find((x) => x.startsWith("Container Number"));
  if (m && containerClash) {
    const f = fields.find((x) => x.key === "containerNo");
    raiseExceptions(
      db,
      m,
      [
        {
          type: "Container Number Mismatch",
          priority: PRIORITY_BY_TYPE["Container Number Mismatch"],
          description: `Verified ${doc.docType} ${doc.id} shows container ${f?.value} but the ledger (terminal report) has ${m.containerNos.join(" / ")}. Billing is blocked until the correct container is confirmed.`,
          conflicts: [{ field: "Container number", systemValue: m.containerNos.join(" / "), sourceValue: f?.value ?? "" }],
        },
      ],
      actor,
    );
  }
  if (m && differences.length) {
    m.events.push(makeEvent(db, "document", `Verified ${doc.docType} ${doc.id} differs from the ledger – ${differences.join("; ")}. Review in the exception queue if needed.`));
  }
  logAudit(db, {
    action: auto ? "Extraction Auto-Verified" : "Extraction Verified (human)",
    module: "Evidence",
    description: `${doc.id} verified by ${actor.name}; ${corrected.length} correction(s)${differences.length ? `; ${differences.length} difference(s) vs ledger` : ""}.`,
    entityId: doc.id,
  });
  return { ok: true, corrected: corrected.length, differences };
}

export interface SubmitChitResult {
  doc: EvidenceDoc;
  movementId: string | null;
}

/** Demo chit submission: find the movement by container, store the chit linked to it and run the fixed extraction. */
export function submitDemoChit(db: DB, chit: DemoChit, dataUrl?: string): SubmitChitResult {
  const movement = db.movements.find((m) => m.containerNos.includes(chit.linkContainer)) ?? null;
  const { doc } = uploadDocument(db, {
    name: chit.fileName,
    docType: chit.docType,
    mime: "image/png",
    sizeKb: 40,
    dataUrl: dataUrl ?? `${DEMO_CHIT_DIR}${chit.fileName}`,
    movementId: movement?.id ?? null,
  });
  runExtraction(db, doc.id);
  completeIfChitsSubmitted(db, movement?.id ?? null);
  return { doc, movementId: movement?.id ?? null };
}
