import type { DB } from "@/types/db";
import type { ColumnMapping, ImportRecord, ImportRowResult } from "@/types/import";
import type { TerminalCode } from "@/types/terminal";
import { actorOf, logAudit, nextId, notify, nowOf } from "../db-helpers";
import type { ProcessedRow } from "../import-processor";
import { createMovement } from "./movement";
import { linkDocument } from "./evidence";
import { anyDemoChitByName } from "@/data/demo-chit-pack";

export interface CommitImportInput {
  fileName: string;
  fingerprint: string;
  terminal: TerminalCode;
  mapping: ColumnMapping;
  rows: ProcessedRow[];
  /** Row numbers of potential duplicates the reviewer chose to import anyway */
  includeDuplicateRows: number[];
  note?: string;
}

export interface CommitImportResult {
  record: ImportRecord;
  rejectedDuplicateFile: boolean;
  createdMovementIds: string[];
}

/** Existing (non-rejected) import with the same file fingerprint, if any. */
export function findImportByFingerprint(db: DB, fingerprint: string): ImportRecord | undefined {
  return db.imports.find((i) => i.fingerprint === fingerprint && i.status !== "Rejected – Duplicate File");
}

const CICT_NOTE = "CICT pilot import – source format is still pending sample validation; results are provisional.";

/** Link chits submitted earlier (while their movement did not exist yet) to newly created movements, matched by container number. */
function autoLinkPendingChits(db: DB, movementIds: string[]): number {
  if (!movementIds.length) return 0;
  const fresh = db.movements.filter((m) => movementIds.includes(m.id));
  let linked = 0;
  for (const doc of db.documents) {
    if (doc.movementId || (doc.docType !== "Loading Chit" && doc.docType !== "Discharge Chit")) continue;
    const container = (anyDemoChitByName(doc.name)?.linkContainer ?? doc.ocr?.fields.find((f) => f.key === "containerNo")?.value ?? "").trim().toUpperCase();
    if (!container) continue;
    const m = fresh.find((x) => x.containerNos.some((c) => c.toUpperCase() === container));
    if (m && linkDocument(db, doc.id, m.id).ok) linked++;
  }
  return linked;
}

/**
 * Commit an import: create movements for valid rows (origin "Import"), keep every row (incl. invalid / duplicate) in the
 * import record with reasons, remember the column mapping and write audit + notification entries.
 * A repeated file fingerprint is recorded as "Rejected – Duplicate File" and creates no movements.
 */
export function commitImport(db: DB, input: CommitImportInput): CommitImportResult {
  const actor = actorOf(db);
  const now = nowOf(db);
  const id = nextId(db, "import", "IMP-", 4);
  const noteParts = [input.note, input.terminal === "CICT" ? CICT_NOTE : undefined].filter(Boolean) as string[];

  const original = findImportByFingerprint(db, input.fingerprint);
  if (original) {
    const rows: ImportRowResult[] = input.rows.map((r) => ({
      ...r.result,
      status: "Duplicate",
      errors: [],
      warnings: [`Not processed – duplicate file (identical to ${original.id})`],
      duplicateOf: undefined,
    }));
    const record: ImportRecord = {
      id,
      fileName: input.fileName,
      fingerprint: input.fingerprint,
      terminal: input.terminal,
      uploadedBy: actor.name,
      uploadedAt: now,
      total: input.rows.length,
      success: 0,
      failed: 0,
      duplicate: input.rows.length,
      status: "Rejected – Duplicate File",
      exceptionsRaised: 0,
      mapping: { ...input.mapping },
      rows,
      note: [`Identical file fingerprint to ${original.id} (${original.fileName}). No movements created; nothing counted twice.`, ...noteParts].join(" "),
    };
    db.imports.unshift(record);
    logAudit(db, {
      action: "Import Rejected (duplicate file)",
      module: "Terminal Imports",
      description: `${input.fileName} (${input.terminal}) rejected as a duplicate of ${original.id}; no movements created.`,
      entityId: id,
    });
    notify(db, {
      title: "Duplicate terminal file rejected",
      body: `${input.fileName} is identical to ${original.id}. Nothing was imported.`,
      level: "warning",
      href: `/terminal-imports/${id}`,
    });
    return { record, rejectedDuplicateFile: true, createdMovementIds: [] };
  }

  const include = new Set(input.includeDuplicateRows);
  const results: ImportRowResult[] = [];
  const created: string[] = [];
  let failed = 0;
  let duplicate = 0;
  for (const row of input.rows) {
    const res: ImportRowResult = { ...row.result, errors: [...row.result.errors], warnings: [...row.result.warnings] };
    if (res.status === "Invalid" || !row.input) {
      res.status = "Invalid";
      failed++;
    } else if (res.status === "Duplicate" && !include.has(res.rowNo)) {
      duplicate++;
    } else {
      const forced = res.status === "Duplicate";
      const mv = createMovement(db, {
        ...row.input,
        importId: id,
        origin: "Import",
        sourceRowNo: res.rowNo,
        notes: input.terminal === "CICT" ? `${row.input.notes} (CICT pilot)` : row.input.notes,
      });
      if (forced) {
        res.warnings.push(`Imported despite potential duplicate of ${res.duplicateOf ?? "another record"} – duplicate exception raised for review`);
      }
      res.status = "Imported";
      res.movementId = mv.id;
      created.push(mv.id);
    }
    results.push(res);
  }
  const success = created.length;
  const autoLinked = autoLinkPendingChits(db, created);
  const exceptionsRaised = db.exceptions.filter((e) => e.importId === id).length;
  const record: ImportRecord = {
    id,
    fileName: input.fileName,
    fingerprint: input.fingerprint,
    terminal: input.terminal,
    uploadedBy: actor.name,
    uploadedAt: now,
    total: input.rows.length,
    success,
    failed,
    duplicate,
    status: failed || duplicate ? "Completed with Issues" : "Completed",
    exceptionsRaised,
    mapping: { ...input.mapping },
    rows: results,
    note: [...noteParts, ...(autoLinked ? [`${autoLinked} previously unlinked chit(s) were linked to the new movements by container number.`] : [])].join(" ") || undefined,
  };
  db.imports.unshift(record);
  db.settings.importMappings = { ...db.settings.importMappings, [input.terminal]: { ...input.mapping } };

  logAudit(db, {
    action: "Terminal Import Committed",
    module: "Terminal Imports",
    description: `${id}: ${input.fileName} (${input.terminal}) – ${success} movement(s) created, ${failed} invalid, ${duplicate} duplicate row(s) held, ${exceptionsRaised} exception(s) raised.`,
    entityId: id,
  });
  notify(db, {
    title: `Import ${id} completed${input.terminal === "CICT" ? " (CICT pilot)" : ""}`,
    body: `${success} of ${input.rows.length} rows imported from ${input.fileName}; ${failed} invalid, ${duplicate} duplicate, ${exceptionsRaised} exception(s) raised.`,
    level: exceptionsRaised || failed || duplicate ? "warning" : "success",
    href: `/terminal-imports/${id}`,
  });
  return { record, rejectedDuplicateFile: false, createdMovementIds: created };
}
