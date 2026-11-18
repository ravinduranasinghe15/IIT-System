import type { DB } from "@/types/db";
import { STD_FIELDS, type ColumnMapping, type ImportRowResult, type StdFieldKey, type StdRow } from "@/types/import";
import { MOVEMENT_STATUSES, type MovementStatus } from "@/types/movement";
import { TERMINAL_CODES, type ContainerSize, type TerminalCode } from "@/types/terminal";
import { checkContainerNo, normalizeContainerNo } from "./container";
import { movementDay } from "./eligibility";
import { operationalDay, parseLooseDate } from "./date-utils";
import type { MovementInput } from "./mutations/movement";
import { validateJourney } from "./mutations/movement";
import { rosterDriverFor } from "./driver-logs";

/**
 * Pure import processing: standard-field extraction, normalisation, validation and duplicate detection.
 * Nothing here writes to the DB; see `lib/mutations/import.ts` for the commit step.
 */

export interface ProcessedRow {
  result: ImportRowResult;
  /** Ready-to-create movement. Present whenever the row has no blocking error OR is only a duplicate (may be force-included). */
  input: MovementInput | null;
  /** Operational day the row belongs to (null if it could not be determined) */
  day: string | null;
  containerNos: string[];
}

export interface ProcessSummary {
  total: number;
  valid: number;
  withWarnings: number;
  invalid: number;
  duplicates: number;
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
const clean = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 16);
  return String(v).trim();
};

/** "20", "20FT", "40'", "40 ft", ISO type codes (22G1, 45G1, ...) → container size. */
export function normalizeSize(v: string): ContainerSize | null {
  const s = v.toUpperCase().replace(/\s+/g, "").replace(/['’`]/g, "");
  if (!s) return null;
  if (/^(20|20FT|20FOOT|20FEET|20GP|20DC|20DV|20HC|20')$/.test(s) || s === "TWENTY") return "20FT";
  if (/^(40|40FT|40FOOT|40FEET|40GP|40DC|40DV|40HC|45|45FT|45HC|40')$/.test(s) || s === "FORTY") return "40FT";
  if (/^[2-4L][0-9][A-Z][0-9]$/.test(s)) {
    if (s[0] === "2") return "20FT";
    if (s[0] === "4" || s[0] === "L") return "40FT";
  }
  return null;
}

const TERMINAL_ALIASES: Record<string, TerminalCode> = { JAYA: "JCT", JAYACONTAINERTERMINAL: "JCT" };

export function resolveTerminal(v: string, db: DB): TerminalCode | null {
  const s = v.toUpperCase().trim();
  if (!s) return null;
  const n = norm(s);
  if ((TERMINAL_CODES as readonly string[]).includes(n)) return n as TerminalCode;
  const token = s.match(/\b(CWIT|SAGT|CICT|JCT|ECT)\b/);
  if (token) return token[1] as TerminalCode;
  for (const t of db.terminals) if (norm(t.name) === n || (n.length >= 6 && norm(t.name).includes(n))) return t.code;
  return TERMINAL_ALIASES[n] ?? null;
}

const STATUS_ALIASES: Record<string, MovementStatus> = {
  COMPLETED: "Completed", COMPLETE: "Completed", DELIVERED: "Completed", DONE: "Completed", CLOSED: "Completed", DISCHARGED: "Completed",
  PENDING: "Pending", SCHEDULED: "Pending", PLANNED: "Pending", BOOKED: "Pending", OPEN: "Pending",
  INTRANSIT: "In Transit", TRANSIT: "In Transit", ENROUTE: "In Transit", ONROUTE: "In Transit", INPROGRESS: "In Transit", LOADED: "In Transit",
  REJECTED: "Rejected", REJECT: "Rejected", REFUSED: "Rejected",
  DAMAGED: "Damaged", DAMAGE: "Damaged",
  UNDERREVIEW: "Under Review", REVIEW: "Under Review", HOLD: "Under Review", ONHOLD: "Under Review",
};

export function resolveStatus(v: string): MovementStatus | null {
  const n = norm(v);
  if (!n) return null;
  const direct = MOVEMENT_STATUSES.find((s) => norm(s) === n);
  return direct ?? STATUS_ALIASES[n] ?? null;
}

export function resolveDriver(v: string, db: DB) {
  const n = norm(v);
  if (!n) return null;
  return db.drivers.find((d) => norm(d.id) === n || norm(d.name) === n) ?? null;
}

export function resolvePrimeMover(v: string, db: DB) {
  const n = norm(v);
  if (!n) return null;
  return db.primeMovers.find((p) => norm(p.id) === n || norm(p.regNo) === n) ?? null;
}

export function resolveTrailer(v: string, db: DB) {
  const n = norm(v);
  if (!n) return null;
  return db.trailers.find((t) => norm(t.id) === n || norm(t.regNo) === n) ?? null;
}

/** Splits "A / B", "A, B", "A + B", "A;B" or multi-line cells into container numbers. */
export function splitContainers(v: string): string[] {
  return v
    .split(/[\/,;+&\n]|\s+and\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

export interface ProcessOptions {
  db: DB;
  terminal: TerminalCode;
  mapping: ColumnMapping;
  rows: Record<string, unknown>[];
  /** display strings (as shown in Excel) preserved as the row's raw cells */
  display: Record<string, string>[];
}

export function processRows({ db, terminal, mapping, rows, display }: ProcessOptions): ProcessedRow[] {
  const startHour = db.settings.opDayStartHour;
  // Index of existing ledger entries: container|source|day → movement id
  const ledger = new Map<string, string>();
  for (const m of db.movements) {
    const day = movementDay(m, startHour);
    if (!day) continue;
    for (const cn of m.containerNos) {
      const key = `${normalizeContainerNo(cn)}|${m.sourceTerminal}|${day}`;
      if (!ledger.has(key)) ledger.set(key, m.id);
    }
  }
  const seenInFile = new Map<string, number>();
  const out: ProcessedRow[] = [];

  rows.forEach((raw, idx) => {
    const rowNo = idx + 2; // spreadsheet row (header = row 1)
    const cell = (key: StdFieldKey): unknown => {
      const col = mapping[key];
      return col ? raw[col] : undefined;
    };
    const text = (key: StdFieldKey) => clean(cell(key));
    const errors: string[] = [];
    const warnings: string[] = [];
    const data: StdRow = {};
    const rawDisplay = display[idx] ?? {};

    // ---- container number(s) ----
    const cnText = text("containerNo");
    const parts = splitContainers(cnText);
    const containerNos: string[] = [];
    if (parts.length === 0) {
      errors.push("Container number is missing");
    } else {
      for (const p of parts) {
        const chk = checkContainerNo(p);
        if (chk === "ok") containerNos.push(normalizeContainerNo(p));
        else if (chk === "check-digit") errors.push(`Invalid container number check digit: '${p}'`);
        else errors.push(`Invalid container number format: '${p}'`);
      }
      if (new Set(containerNos).size !== containerNos.length) errors.push("Same container number listed twice in one row");
    }
    data.containerNo = parts.map((p) => (checkContainerNo(p) === "ok" ? normalizeContainerNo(p) : p)).join(" / ");

    // ---- size ----
    const sizeText = text("containerSize");
    let size: ContainerSize | null = null;
    if (sizeText) {
      size = normalizeSize(sizeText);
      if (!size) errors.push(`Unrecognised container size '${sizeText}'`);
    } else {
      size = containerNos.length > 1 ? "20FT" : "40FT";
      warnings.push(`Container size not provided – assumed ${size} (verify)`);
    }
    if (size) data.containerSize = size;
    if (size) {
      const journey = validateJourney(size, containerNos.length ? containerNos : ["x"]);
      if (journey && containerNos.length) errors.push(journey);
    }

    // ---- terminals ----
    let source: TerminalCode | null = null;
    const srcText = text("sourceTerminal");
    if (srcText) {
      source = resolveTerminal(srcText, db);
      if (!source) errors.push(`Unknown source terminal '${srcText}'`);
      else if (source !== terminal) warnings.push(`Source terminal ${source} differs from the selected import source ${terminal}`);
    } else {
      source = terminal;
      warnings.push(`Source terminal blank – assumed ${terminal} from the selected import source`);
    }
    if (source) data.sourceTerminal = source;
    let destination: TerminalCode | null = null;
    const dstText = text("destinationTerminal");
    if (!dstText) errors.push("Destination terminal is missing");
    else {
      destination = resolveTerminal(dstText, db);
      if (!destination) errors.push(`Unknown destination terminal '${dstText}'`);
    }
    if (destination) data.destinationTerminal = destination;
    else if (dstText) data.destinationTerminal = dstText;
    if (source && destination && source === destination) errors.push("Source and destination terminal are the same");

    // ---- truck / trailer ----
    const truckText = text("truckNo");
    let primeMoverId: string | null = null;
    let pm = null as ReturnType<typeof resolvePrimeMover>;
    if (!truckText) warnings.push("Truck number missing");
    else {
      pm = resolvePrimeMover(truckText, db);
      if (pm) primeMoverId = pm.id;
      else {
        primeMoverId = truckText;
        warnings.push(`Truck '${truckText}' is not in the fleet master data`);
      }
    }
    if (truckText) data.truckNo = pm ? pm.id : truckText;
    const trailerText = text("trailerNo");
    let trailerId: string | null = null;
    if (trailerText) {
      const tr = resolveTrailer(trailerText, db);
      if (tr) trailerId = tr.id;
      else {
        warnings.push(`Trailer '${trailerText}' is not in master data${pm?.trailerId ? " – using the prime mover's assigned trailer" : ""}`);
        trailerId = pm?.trailerId ?? null;
      }
    } else if (pm?.trailerId) {
      trailerId = pm.trailerId;
    }
    if (trailerId) data.trailerNo = trailerId;

    // ---- driver ----
    const driverText = text("driver");
    let driverId: string | null = null;
    let driverSource: "roster" | "manual" | undefined;
    if (driverText) {
      const d = resolveDriver(driverText, db);
      if (d) {
        driverId = d.id;
        driverSource = "manual";
      } else warnings.push(`Driver '${driverText}' is not in the driver master data`);
    }
    if (driverText) data.driver = driverId ? (db.drivers.find((d) => d.id === driverId)?.name ?? driverText) : driverText;

    // ---- dates ----
    const parseDate = (key: StdFieldKey, label: string): string | null => {
      const p = parseLooseDate(cell(key));
      if (p === "invalid") {
        errors.push(`Invalid ${label.toLowerCase()} '${rawDisplay[mapping[key] ?? ""] || clean(cell(key))}'`);
        return null;
      }
      return p;
    };
    const loadingAt = parseDate("loadingAt", "Loading time");
    const dischargeAt = parseDate("dischargeAt", "Discharge time");
    // the terminal report names the truck, not the driver: take the driver the roster has on that truck for that shift
    if (!driverText) {
      const rd = rosterDriverFor(db, primeMoverId, loadingAt);
      if (rd) {
        driverId = rd;
        driverSource = "roster";
        data.driver = db.drivers.find((d) => d.id === rd)?.name ?? rd;
      } else warnings.push("No driver on the roster for this truck and shift – the driver will be set from the driver log");
    }
    if (loadingAt) data.loadingAt = loadingAt;
    if (dischargeAt) data.dischargeAt = dischargeAt;
    const dateBroken = errors.some((e) => e.startsWith("Invalid loading time") || e.startsWith("Invalid discharge time"));
    if (!loadingAt && !dateBroken) {
      if (!dischargeAt) errors.push("Neither loading nor discharge time is provided");
      else warnings.push("Loading time missing");
    }
    if (loadingAt && dischargeAt && dischargeAt < loadingAt) errors.push("Discharge time is earlier than loading time");

    // ---- status ----
    const statusText = text("status");
    let status: MovementStatus | null = null;
    if (statusText) {
      status = resolveStatus(statusText);
      if (!status) errors.push(`Unrecognised movement status '${statusText}'`);
    } else {
      status = dischargeAt ? "Completed" : "In Transit";
      warnings.push(`Status not provided – inferred '${status}'`);
    }
    if (status) data.status = status;
    if (status === "Completed" && !dischargeAt && !dateBroken) warnings.push("Completed without a discharge time – an arrival-time exception will be raised");

    // ---- duplicate detection (existing ledger & within the file) ----
    const firstTime = loadingAt ?? dischargeAt;
    const day = firstTime ? operationalDay(firstTime, startHour) : null;
    let duplicateOf: string | undefined;
    if (day && source && containerNos.length) {
      for (const cn of containerNos) {
        const key = `${cn}|${source}|${day}`;
        const ledgerHit = ledger.get(key);
        const fileHit = seenInFile.get(key);
        if (ledgerHit) {
          duplicateOf = ledgerHit;
          break;
        }
        if (fileHit !== undefined) {
          duplicateOf = `Row ${fileHit}`;
          break;
        }
      }
    }
    const blocking = errors.length > 0;
    if (!blocking && day && source) for (const cn of containerNos) {
      const key = `${cn}|${source}|${day}`;
      if (!seenInFile.has(key)) seenInFile.set(key, rowNo);
    }

    // ---- notes carried onto the movement so source values are never lost ----
    const unresolved = warnings.filter((w) => /not in (the )?(fleet|driver|master)/.test(w));
    const notes = [`Imported from ${terminal} terminal report (row ${rowNo}).`, ...unresolved.map((w) => `${w}.`)].join(" ");

    let input: MovementInput | null = null;
    if (!blocking && size && source && destination && status) {
      input = {
        containerNos,
        containerSize: size,
        sourceTerminal: source,
        destinationTerminal: destination,
        primeMoverId,
        trailerId,
        driverId,
        driverSource,
        loadingAt,
        dischargeAt,
        status,
        notes,
        origin: "Import",
        sourceRowNo: rowNo,
      };
    }

    out.push({
      result: {
        rowNo,
        status: blocking ? "Invalid" : duplicateOf ? "Duplicate" : "Imported",
        errors,
        warnings,
        data,
        raw: rawDisplay,
        duplicateOf: blocking ? undefined : duplicateOf,
      },
      input,
      day,
      containerNos,
    });
  });
  return out;
}

export function summarize(rows: ProcessedRow[], includedDuplicates: ReadonlySet<number> = new Set()): ProcessSummary {
  let valid = 0;
  let withWarnings = 0;
  let invalid = 0;
  let duplicates = 0;
  for (const r of rows) {
    const s = r.result.status;
    if (s === "Invalid") invalid++;
    else if (s === "Duplicate" && !includedDuplicates.has(r.result.rowNo)) duplicates++;
    else if (r.result.warnings.length) withWarnings++;
    else valid++;
  }
  return { total: rows.length, valid, withWarnings, invalid, duplicates };
}

/** Rows that will become movements: valid / warning rows plus duplicates the user chose to include. */
export function importableRows(rows: ProcessedRow[], includedDuplicates: ReadonlySet<number>): ProcessedRow[] {
  return rows.filter(
    (r) => r.input && (r.result.status === "Imported" || (r.result.status === "Duplicate" && includedDuplicates.has(r.result.rowNo))),
  );
}

export function missingRequiredFields(mapping: ColumnMapping): string[] {
  return STD_FIELDS.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
}

const CSV_COLS = ["Row", "Status", "Reasons", "Container", "Size", "Source", "Destination", "Truck", "Trailer", "Driver", "Loading", "Discharge", "Movement status", "Existing record"] as const;

/** Flatten row results for CSV download (rejected rows keep their reasons). */
export function rowsToCsvRows(rows: ImportRowResult[]): Record<string, string | number>[] {
  return rows.map((r) => ({
    Row: r.rowNo,
    Status: r.status,
    Reasons: [...r.errors, ...r.warnings.map((w) => `(warning) ${w}`), ...(r.duplicateOf ? [`Potential duplicate of ${r.duplicateOf}`] : [])].join("; "),
    Container: r.data.containerNo ?? "",
    Size: r.data.containerSize ?? "",
    Source: r.data.sourceTerminal ?? "",
    Destination: r.data.destinationTerminal ?? "",
    Truck: r.data.truckNo ?? "",
    Trailer: r.data.trailerNo ?? "",
    Driver: r.data.driver ?? "",
    Loading: r.data.loadingAt ?? "",
    Discharge: r.data.dischargeAt ?? "",
    "Movement status": r.data.status ?? "",
    "Existing record": r.movementId ?? r.duplicateOf ?? "",
  }));
}
export const CSV_COLUMNS: string[] = [...CSV_COLS];
