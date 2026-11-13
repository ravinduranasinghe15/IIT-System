import type { DB } from "@/types/db";
import type { DocType, EvidenceDoc, OcrField } from "@/types/evidence";
import { actorOf, logAudit, nextId, nowOf } from "../db-helpers";
import { ledgerValueFor, sameValue, simulateExtraction } from "../ocr-sim";
import { makeEvent } from "./movement";

/** Stored as a data URL only below this size – larger files keep metadata only (browser storage limits). */
export const MAX_DATA_URL_KB = 600;

export interface UploadInput {
  name: string;
  docType: DocType;
  mime: string;
  sizeKb: number;
  dataUrl?: string;
  movementId: string | null;
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
  return { doc, openExceptionIds: relatedMissingChitExceptions(db, input.movementId, input.docType), storedPreview };
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
  const { fields, sourceMovement, inferred } = simulateExtraction(doc, db);
  const rerun = !!doc.ocr;
  doc.ocr = { fields, extractedAt: now, verified: false };
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
  return doc;
}

/** Human verification of (possibly corrected) extracted values. Never edits the movement. */
export function verifyExtraction(db: DB, docId: string, fields: OcrField[]): { ok: boolean; corrected: number; differences: string[] } {
  const doc = db.documents.find((d) => d.id === docId);
  if (!doc?.ocr) return { ok: false, corrected: 0, differences: [] };
  const actor = actorOf(db);
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
      if (ledger !== null && f.value && !sameValue(f.value, ledger, f.key, db)) differences.push(`${f.label}: chit '${f.value}' vs ledger '${ledger}'`);
    }
  }
  doc.ocr = { ...doc.ocr, fields: fields.map((f) => ({ ...f })), verified: true, verifiedBy: actor.name, verifiedAt: now };
  doc.history.push({
    at: now,
    by: actor.name,
    action: `Extraction verified by human${corrected.length ? ` (${corrected.length} field(s) corrected: ${corrected.map((c) => c.label).join(", ")})` : " (no corrections)"}`,
  });
  if (m && differences.length) {
    m.events.push(makeEvent(db, "document", `Verified ${doc.docType} ${doc.id} differs from the ledger – ${differences.join("; ")}. Review in the exception queue if needed.`));
  }
  logAudit(db, {
    action: "Extraction Verified (human)",
    module: "Evidence",
    description: `${doc.id} verified by ${actor.name}; ${corrected.length} correction(s)${differences.length ? `; ${differences.length} difference(s) vs ledger` : ""}.`,
    entityId: doc.id,
  });
  return { ok: true, corrected: corrected.length, differences };
}
