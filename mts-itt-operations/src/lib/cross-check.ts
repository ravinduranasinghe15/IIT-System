import type { DB } from "@/types/db";
import type { EvidenceDoc, OcrField } from "@/types/evidence";
import type { Movement } from "@/types/movement";
import { logLedgerValue, logsFor, movementsCovered } from "./driver-logs";
import { ledgerValueFor, sameValue } from "./ocr-sim";

/**
 * Cross-check: before anything is trusted automatically, the loading / discharge chits and the driver log sheet are
 * compared with each other and with the terminal data (the movement) and the roster.
 *
 *  Chit  vs movement : container(s), truck, terminal, time (within 30 min), driver (when the movement has one)
 *  Chit  vs driver log: driver and truck written on the chit against the sheet covering that movement
 *  Log   vs movements: every container on the sheet is a covered movement and every covered container is on the sheet
 *  Log   vs roster   : the driver on the sheet is the one the roster has on that lorry and shift
 *  Log   vs chits    : the driver on the sheet is the driver written on the chits of the movements it covers
 *
 * A document with any mismatch is never verified automatically (a person has to review it) and an automatically verified
 * document that conflicts with another one blocks the movement from becoming Billable.
 */

export interface Mismatch {
  /** The document the mismatch belongs to (the one that has to be reviewed) */
  docId: string;
  field: string;
  message: string;
  /** The other document in a document-against-document mismatch: a person verifying either one counts as the review */
  with?: string;
}

export const AUTO_VERIFIER_NAME = "System (auto)";

const fieldOf = (doc: EvidenceDoc, key: string): OcrField | undefined => doc.ocr?.fields.find((f) => f.key === key);
const nm = (db: DB, v: string) => (db.drivers.find((d) => d.id === v)?.name ?? v).trim();
const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

const KEY_LABEL: Record<string, string> = { containerNo: "Container number", truckNo: "Truck number", driver: "Driver", terminal: "Terminal", datetime: "Date and time" };

/** Chit fields against the movement they are linked to. */
function chitVsMovement(db: DB, doc: EvidenceDoc, m: Movement): Mismatch[] {
  const out: Mismatch[] = [];
  for (const f of doc.ocr?.fields ?? []) {
    if (f.key === "kind") continue;
    const ledger = ledgerValueFor(f.key, m, doc, db);
    if (ledger === null || ledger === "" || !f.value) continue;
    if (!sameValue(f.value, ledger, f.key, db)) out.push({ docId: doc.id, field: f.key, message: `${KEY_LABEL[f.key] ?? f.label}: chit '${f.value}' vs ${m.id} '${ledger}'` });
  }
  // a discharge cannot happen before the loading, and not days later (the terminal report has no discharge time yet)
  const when = doc.docType === "Discharge Chit" ? fieldOf(doc, "datetime")?.value : "";
  if (when && m.loadingAt && !m.dischargeAt) {
    const gap = (Date.parse(when) - Date.parse(m.loadingAt)) / 60000;
    if (gap < -30) out.push({ docId: doc.id, field: "datetime", message: `Discharge time '${when}' is before the loading time '${m.loadingAt}' of ${m.id}` });
    else if (gap > 12 * 60) out.push({ docId: doc.id, field: "datetime", message: `Discharge time '${when}' is more than 12 hours after the loading time '${m.loadingAt}' of ${m.id}` });
  }
  return out;
}

/** Chit driver / truck against any driver log sheet that covers the movement. */
function chitVsLogs(db: DB, doc: EvidenceDoc, m: Movement): Mismatch[] {
  const out: Mismatch[] = [];
  const driver = fieldOf(doc, "driver")?.value;
  const truck = fieldOf(doc, "truckNo")?.value;
  for (const log of logsFor(db, m)) {
    const meta = log.driverLog!;
    if (driver && meta.driverId && norm(nm(db, driver)) !== norm(nm(db, meta.driverId))) out.push({ docId: doc.id, field: "driver", with: log.id, message: `Driver: chit '${driver}' vs driver log ${log.id} '${nm(db, meta.driverId)}'` });
    const lorry = meta.primeMoverId ? db.primeMovers.find((p) => p.id === meta.primeMoverId)?.regNo : null;
    if (truck && lorry && norm(truck) !== norm(lorry)) out.push({ docId: doc.id, field: "truckNo", with: log.id, message: `Truck: chit '${truck}' vs driver log ${log.id} '${lorry}'` });
  }
  return out;
}

export function chitMismatches(db: DB, doc: EvidenceDoc): Mismatch[] {
  if (!doc.ocr || (doc.docType !== "Loading Chit" && doc.docType !== "Discharge Chit")) return [];
  const m = doc.movementId ? db.movements.find((x) => x.id === doc.movementId) : null;
  if (!m) return [];
  return [...chitVsMovement(db, doc, m), ...chitVsLogs(db, doc, m)];
}

/** Containers listed on a log sheet (Trip n fields: "CONTAINER | size | FROM > TO"). */
const sheetContainers = (doc: EvidenceDoc) =>
  (doc.ocr?.fields ?? [])
    .filter((f) => /^trip\d+$/.test(f.key))
    .map((f) => f.value.split("|")[0].trim().toUpperCase())
    .filter(Boolean);

export function logMismatches(db: DB, doc: EvidenceDoc): Mismatch[] {
  const meta = doc.driverLog;
  if (!doc.ocr || doc.docType !== "Driver Log Sheet" || !meta) return [];
  const out: Mismatch[] = [];
  const covered = movementsCovered(db, doc);

  // driver against the roster
  const drv = fieldOf(doc, "driver");
  const rosterDriver = logLedgerValue(db, doc, "driver", drv?.value ?? "");
  if (drv?.value && rosterDriver && norm(nm(db, drv.value)) !== norm(rosterDriver)) out.push({ docId: doc.id, field: "driver", message: `Driver: sheet '${drv.value}' vs roster '${rosterDriver}'` });

  // trips against the covered movements (both ways)
  if (covered.length) {
    const onSheet = new Set(sheetContainers(doc));
    const inLedger = new Set(covered.flatMap((m) => m.containerNos.map((c) => c.toUpperCase())));
    for (const c of onSheet) if (!inLedger.has(c)) out.push({ docId: doc.id, field: "trips", message: `Container ${c} is on the sheet but not on any movement for this lorry and shift` });
    for (const m of covered) for (const c of m.containerNos) if (!onSheet.has(c.toUpperCase())) out.push({ docId: doc.id, field: "trips", message: `${m.id} (${c}) is in the terminal report but not written on the sheet` });
  }

  // driver against the chits of the covered movements
  for (const m of covered) {
    for (const chit of db.documents.filter((d) => d.movementId === m.id && d.ocr && (d.docType === "Loading Chit" || d.docType === "Discharge Chit"))) {
      const cdf = fieldOf(chit, "driver");
      const cd = cdf && cdf.confidence >= db.settings.ocrConfidenceThreshold ? cdf.value : ""; // a misread, low-confidence name proves nothing about the sheet
      if (cd && drv?.value && norm(nm(db, cd)) !== norm(nm(db, drv.value))) out.push({ docId: doc.id, field: "driver", with: chit.id, message: `Driver: sheet '${drv.value}' vs ${chit.docType.toLowerCase()} ${chit.id} '${cd}'` });
    }
  }
  return dedupe(out);
}

const dedupe = (list: Mismatch[]) => list.filter((x, i) => list.findIndex((y) => y.docId === x.docId && y.message === x.message) === i);

export function docMismatches(db: DB, doc: EvidenceDoc): Mismatch[] {
  return doc.docType === "Driver Log Sheet" ? logMismatches(db, doc) : chitMismatches(db, doc);
}

/** Every mismatch among the documents of one movement: its chits, and the driver log sheets covering it. */
export function movementMismatches(db: DB, m: Movement): Mismatch[] {
  const chits = db.documents.filter((d) => d.movementId === m.id && d.ocr && (d.docType === "Loading Chit" || d.docType === "Discharge Chit"));
  return dedupe([...chits.flatMap((c) => chitMismatches(db, c)), ...logsFor(db, m).flatMap((l) => logMismatches(db, l))]);
}

/**
 * Mismatches that nobody has reviewed yet: they belong to a document that the system verified by itself. Once a person
 * verifies that document the mismatch counts as reviewed (the person decided it is fine or corrected the values).
 */
export function unreviewedMismatches(db: DB, m: Movement): Mismatch[] {
  const auto = new Set(db.documents.filter((d) => d.ocr?.verified && d.ocr.verifiedBy === AUTO_VERIFIER_NAME).map((d) => d.id));
  const byPerson = new Set(db.documents.filter((d) => d.ocr?.verified && d.ocr.verifiedBy !== AUTO_VERIFIER_NAME).map((d) => d.id));
  return movementMismatches(db, m).filter((x) => auto.has(x.docId) && !(x.with && byPerson.has(x.with)));
}
