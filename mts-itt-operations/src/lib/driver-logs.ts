import type { DB } from "@/types/db";
import type { DriverLogMeta, EvidenceDoc, OcrField } from "@/types/evidence";
import type { Movement } from "@/types/movement";
import { SHIFT_HOURS, WORK_SHIFTS } from "./roster-rules";
import { addDays } from "./date-utils";

/**
 * Driver logs: the supervisor uploads one driver log sheet per driver per shift. A movement is covered when a sheet exists
 * for the same lorry (or driver), on the shift date and shift in which the movement was loaded. Informational only – no billing gate.
 */

/** Shift date and shift a local "yyyy-MM-ddTHH:mm" time falls in (night shift after midnight belongs to the previous date). */
export function shiftOfTime(iso: string): { date: string; shift: DriverLogMeta["shift"] } {
  const day = iso.slice(0, 10);
  const hour = Number(iso.slice(11, 13));
  for (const s of WORK_SHIFTS) {
    const { start, end } = SHIFT_HOURS[s];
    if (hour >= start && hour < end) return { date: day, shift: s };
  }
  return { date: hour < SHIFT_HOURS.Morning.start ? addDays(day, -1) : day, shift: "Night" };
}

/** Driver rostered on `truckId` for the shift that `loadingAt` falls in (an absent driver's replacement counts). */
export function rosterDriverFor(db: DB, truckId: string | null, loadingAt: string | null): string | null {
  if (!truckId || !loadingAt) return null;
  const { date, shift } = shiftOfTime(loadingAt);
  const entry = db.roster.find((r) => r.date === date && r.shift === shift && r.primeMoverId === truckId && r.attendance !== "Absent");
  return entry?.driverId ?? null;
}

/** Shift a movement belongs to (the shift its loading time falls in), or null when it has no loading time. */
export const movementShift = (m: Movement): DriverLogMeta["shift"] | null => (m.loadingAt ? shiftOfTime(m.loadingAt).shift : null);

/** Keeps the movements of one shift ("" = all shifts). */
export const filterByShift = (ms: Movement[], shift: "" | DriverLogMeta["shift"]): Movement[] => (shift ? ms.filter((m) => movementShift(m) === shift) : ms);

export const driverLogSheets = (db: DB): EvidenceDoc[] => db.documents.filter((d) => d.docType === "Driver Log Sheet" && d.driverLog);

/** Movements that are expected to appear on a driver log (legacy seed movements are exempt). */
export const needsLog = (m: Movement) => m.origin !== "Seed" && m.status !== "Pending" && !!m.loadingAt;

export function logCovers(log: DriverLogMeta, m: Movement): boolean {
  if (!m.loadingAt) return false;
  const { date, shift } = shiftOfTime(m.loadingAt);
  if (log.date !== date || log.shift !== shift) return false;
  // the lorry is the key (the report names the truck, and the sheet names the driver who actually drove it)
  if (log.primeMoverId && m.primeMoverId) return log.primeMoverId === m.primeMoverId;
  return !!log.driverId && log.driverId === m.driverId;
}

/** Movements a driver log sheet covers (a sheet is never linked to just one movement). */
export function movementsCovered(db: DB, doc: EvidenceDoc): Movement[] {
  return doc.driverLog ? db.movements.filter((m) => needsLog(m) && logCovers(doc.driverLog!, m)) : [];
}

/**
 * "Ledger" value of one extracted field of a driver log sheet. A sheet is not linked to a single movement, so its fields
 * are compared with the movements it covers (same lorry, date and shift) and with the roster:
 *  - Driver Name  -> the driver the roster has on that lorry and shift
 *  - Lorry Number -> the lorry's registration
 *  - Shift / Date -> the shift and operational date of the covered movements
 *  - Trip n       -> the covered movement carrying that container
 *  - Trips written -> container count over the covered movements
 * Returns null when there is nothing to compare with (no covered movements).
 */
export function logLedgerValue(db: DB, doc: EvidenceDoc, key: string, value: string): string | null {
  const meta = doc.driverLog;
  if (!meta) return null;
  const covered = movementsCovered(db, doc).sort((a, b) => (a.loadingAt ?? "").localeCompare(b.loadingAt ?? ""));
  const pm = meta.primeMoverId ? db.primeMovers.find((p) => p.id === meta.primeMoverId) : null;
  const entries = covered.flatMap((m) => m.containerNos.map((cn) => ({ cn: cn.toUpperCase(), text: `${cn} | ${m.containerSize.replace("FT", "")} | ${m.sourceTerminal} > ${m.destinationTerminal}` })));
  switch (key) {
    case "driver": {
      const e = db.roster.find((r) => r.date === meta.date && r.shift === meta.shift && r.attendance !== "Absent" && (meta.primeMoverId ? r.primeMoverId === meta.primeMoverId : r.driverId === meta.driverId));
      return e ? (db.drivers.find((d) => d.id === e.driverId)?.name ?? e.driverId) : "";
    }
    case "truckNo":
      return pm ? pm.regNo : covered[0]?.primeMoverId ? (db.primeMovers.find((p) => p.id === covered[0].primeMoverId)?.regNo ?? "") : null;
    case "shift":
      return covered.length ? shiftOfTime(covered[0].loadingAt!).shift : null;
    case "date":
      return covered.length ? shiftOfTime(covered[0].loadingAt!).date : null;
    case "tripTotal":
      return covered.length ? String(entries.length) : null;
    default: {
      if (!/^trip\d+$/.test(key)) return null;
      if (!covered.length) return null;
      const cn = value.split("|")[0].trim().toUpperCase();
      return entries.find((e) => e.cn === cn)?.text ?? "Not on the covered movements";
    }
  }
}

export function logsFor(db: DB, m: Movement): EvidenceDoc[] {
  return driverLogSheets(db).filter((d) => logCovers(d.driverLog!, m));
}

/** True when a VERIFIED driver log sheet covers the movement (movements that need no log always pass). */
export function hasVerifiedDriverLog(db: DB, m: Movement): boolean {
  if (!needsLog(m)) return true;
  return logsFor(db, m).some((d) => d.ocr?.verified);
}

/** Extraction fields for a log sheet from the header the supervisor entered (the paper sheet's contents are not read). */
export function logFieldsFromMeta(db: DB, meta: DriverLogMeta): OcrField[] {
  const driver = meta.driverId ? (db.drivers.find((d) => d.id === meta.driverId)?.name ?? meta.driverId) : "";
  const lorry = meta.primeMoverId ? (db.primeMovers.find((p) => p.id === meta.primeMoverId)?.regNo ?? meta.primeMoverId) : "";
  return [
    { key: "driver", label: "Driver Name", value: driver, confidence: 92 },
    { key: "truckNo", label: "Lorry Number", value: lorry, confidence: 92 },
    { key: "shift", label: "Shift", value: meta.shift, confidence: 98 },
    { key: "date", label: "Date", value: meta.date, confidence: 96 },
  ];
}

export interface MissingLog {
  movement: Movement;
  date: string;
  shift: DriverLogMeta["shift"];
  /** Why this movement cannot be matched, if it is more than just "no sheet uploaded" */
  note?: string;
}

export function driverLogStats(db: DB) {
  const sheets = driverLogSheets(db);
  const required = db.movements.filter(needsLog);
  const missing: MissingLog[] = [];
  let covered = 0;
  for (const m of required) {
    if (sheets.some((d) => logCovers(d.driverLog!, m))) {
      covered++;
      continue;
    }
    const { date, shift } = shiftOfTime(m.loadingAt!);
    missing.push({ movement: m, date, shift, note: !m.primeMoverId && !m.driverId ? "No lorry or driver recorded on the movement" : undefined });
  }
  missing.sort((a, b) => (a.movement.loadingAt! < b.movement.loadingAt! ? 1 : -1));
  return { sheets, required: required.length, covered, missing };
}
