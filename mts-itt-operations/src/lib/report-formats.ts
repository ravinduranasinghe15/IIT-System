import * as XLSX from "xlsx";
import type { DB } from "@/types/db";
import type { TerminalCode } from "@/types/terminal";
import { addDays, demoToday, parseLooseDate } from "./date-utils";
import { fingerprintOf, suggestMapping } from "./excel-parser";
import { resolvePrimeMover } from "./import-processor";
import { rosterDriverFor } from "./driver-logs";

/**
 * Terminal report adapters. Every terminal sends its own layout; each adapter turns it into the ONE common format the
 * system validates and imports (the standard columns below). Nothing downstream knows which terminal the file came from.
 */

export const COMMON_COLUMNS = ["Container No", "Size", "Origin", "Destination", "Truck", "Trailer", "Driver", "Load Time", "Discharge Time", "Status"] as const;
export type CommonRow = Record<(typeof COMMON_COLUMNS)[number], string>;

export type ReportFormatId = "CWIT-ITT-OUT" | "SAGT-CONTAINER" | "COMMON";

export interface SheetData {
  fileName: string;
  fileSizeKb: number;
  fingerprint: string;
  sheetName: string;
  /** typed values (numbers for dates) */
  raw: unknown[][];
  /** text as displayed in Excel */
  text: string[][];
}

export interface ColumnLink {
  /** Column in the terminal's file ("(implied)" parts are explained in `how`) */
  source: string;
  common: string;
  how?: string;
}

export interface NormalisedReport {
  format: ReportFormatId;
  formatLabel: string;
  terminal: TerminalCode;
  /** how the terminal's columns map to the common format */
  links: ColumnLink[];
  /** rows in the common format */
  rows: CommonRow[];
  /** display copy of each row (adds where it came from) */
  display: Record<string, string>[];
  notes: string[];
  /** data rows found in the file (before grouping) */
  sourceRows: number;
}

/** Reads the first worksheet of an XLSX / XLS / CSV file without assuming any layout. */
export async function readSheetData(file: File): Promise<SheetData> {
  const buf = await file.arrayBuffer();
  const fingerprint = await fingerprintOf(buf);
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("The file does not contain any worksheet.");
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
  const text = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: "" });
  if (raw.length === 0) throw new Error("The worksheet is empty.");
  return { fileName: file.name, fileSizeKb: Math.max(1, Math.round(file.size / 1024)), fingerprint, sheetName, raw, text };
}

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v: unknown) => String(v ?? "").trim();

/** Finds the header row (within the first 40 rows) that contains all the given normalised labels. */
function findHeader(sheet: SheetData, labels: string[]): { row: number; cols: Record<string, number> } | null {
  for (let r = 0; r < Math.min(40, sheet.raw.length); r++) {
    const cols: Record<string, number> = {};
    (sheet.raw[r] ?? []).forEach((c, i) => {
      const k = norm(c);
      if (k && cols[k] === undefined) cols[k] = i;
    });
    if (labels.every((l) => cols[l] !== undefined)) return { row: r, cols };
  }
  return null;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n: number) => String(n).padStart(2, "0");

/** "20-Oct 08:40" (no year) -> ISO. The year is the current year of the system date, or the previous one if that would be in the future. */
function parseDayMonthTime(s: string): string | null {
  const m = s.trim().match(/^(\d{1,2})[-/ ]([A-Za-z]{3})[A-Za-z]*\.?[ ,]+(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const mon = MONTHS[m[2].toLowerCase()];
  if (!mon) return null;
  const today = demoToday();
  let year = Number(today.slice(0, 4));
  const iso = (y: number) => `${y}-${pad(mon)}-${pad(Number(m[1]))}T${pad(Number(m[3]))}:${m[4]}`;
  if (iso(year).slice(0, 10) > addDays(today, 1)) year -= 1;
  return iso(year);
}

/** Time cell -> "yyyy-MM-dd HH:mm" (or "" when blank / unreadable). */
function timeOf(raw: unknown, text: string): string {
  let iso: string | null | "invalid" = null;
  if (typeof raw === "number") iso = parseLooseDate(raw);
  else if (str(raw)) iso = parseDayMonthTime(str(raw)) ?? parseLooseDate(str(raw));
  else if (text) iso = parseDayMonthTime(text) ?? parseLooseDate(text);
  return iso && iso !== "invalid" ? iso.replace("T", " ").slice(0, 16) : "";
}

const sizeOf = (s: string): string => {
  const v = s.toUpperCase().replace(/\s+/g, "");
  if (/^20/.test(v) || /^2[A-Z0-9]{3}$/.test(v)) return "20FT";
  if (/^(40|45)/.test(v) || /^[4L][A-Z0-9]{3}$/.test(v)) return "40FT";
  return s;
};

/**
 * The reports carry no driver and drivers are not tied to a truck: the driver is whoever the roster has on that truck for
 * that date and shift. (A verified driver log sheet can correct it later.)
 */
function driverFor(db: DB, truck: string, loading: string): { name: string; source: "roster" | "none" } {
  const pm = truck ? resolvePrimeMover(truck, db) : null;
  if (!pm || !loading) return { name: "", source: "none" };
  const id = rosterDriverFor(db, pm.id, loading.replace(" ", "T"));
  const d = id ? db.drivers.find((x) => x.id === id) : undefined;
  return d ? { name: d.name, source: "roster" } : { name: "", source: "none" };
}

interface Unit {
  container: string;
  size: string;
  truck: string;
  loading: string;
  dest: string;
  rowNo: number;
}

/** Turns extracted container lines into common-format rows; 20 ft containers on the same truck, time and destination share one journey. */
function toRows(db: DB, origin: TerminalCode, units: Unit[]) {
  const rows: CommonRow[] = [];
  const display: Record<string, string>[] = [];
  let paired = 0;
  const bySource = { roster: 0, none: 0 };
  const used = new Set<number>();
  units.forEach((u, i) => {
    if (used.has(i)) return;
    used.add(i);
    const group = [u];
    if (u.size === "20FT") {
      const j = units.findIndex((o, k) => !used.has(k) && o.size === "20FT" && o.truck === u.truck && o.loading === u.loading && o.dest === u.dest);
      if (j >= 0) {
        used.add(j);
        group.push(units[j]);
        paired += 1;
      }
    }
    const drv = driverFor(db, u.truck, u.loading);
    bySource[drv.source] += 1;
    const row: CommonRow = {
      "Container No": group.map((g) => g.container).join(" / "),
      Size: u.size,
      Origin: origin,
      Destination: u.dest,
      Truck: u.truck,
      Trailer: "",
      Driver: drv.name,
      "Load Time": u.loading,
      "Discharge Time": "",
      Status: "In Transit",
    };
    rows.push(row);
    display.push({ ...row, "Source row(s)": group.map((g) => `Row ${g.rowNo}`).join(", "), "Driver source": drv.source === "roster" ? "Roster (driver on that truck and shift)" : "Not on the roster" });
  });
  return { rows, display, paired, bySource };
}

function commonNotes(origin: TerminalCode, r: ReturnType<typeof toRows>): string[] {
  const n = [`Origin set to ${origin}: the report is the ${origin} terminal's own list of containers leaving it.`, "Status set to In Transit: delivery is confirmed later by the verified discharge chit."];
  if (r.paired) n.push(`${r.paired} pair(s) of 20 ft containers on the same truck and time were combined into one journey with two containers.`);
  const d: string[] = [];
  if (r.bySource.roster) d.push(`${r.bySource.roster} from the roster`);
  if (r.bySource.none) d.push(`${r.bySource.none} not on the roster (the driver log will supply them)`);
  n.push(`The report has no driver column. Drivers are not tied to a truck, so the driver is taken from the roster (truck, date and shift): ${d.join(", ") || "none"}.`);
  return n;
}

function cwit(db: DB, sheet: SheetData): NormalisedReport | null {
  const h = findHeader(sheet, ["containerno", "unittimeout", "terminal"]);
  if (!h) return null;
  const c = h.cols;
  const units: Unit[] = [];
  let sourceRows = 0;
  for (let r = h.row + 1; r < sheet.raw.length; r++) {
    const sno = c.sno === undefined ? "x" : str(sheet.raw[r]?.[c.sno]);
    const container = str(sheet.raw[r]?.[c.containerno]);
    if (!/^\d+$/.test(sno) || !container) {
      if (units.length > 0 && !container) break; // summary block / blank rows after the data
      continue;
    }
    sourceRows += 1;
    units.push({
      container: container.toUpperCase(),
      size: sizeOf(str(sheet.raw[r]?.[c.length ?? -1]) || str(sheet.raw[r]?.[c.typeiso ?? -1])),
      truck: str(sheet.raw[r]?.[c.truckvisittruck ?? -1]),
      loading: timeOf(sheet.raw[r]?.[c.unittimeout], str(sheet.text[r]?.[c.unittimeout])),
      dest: str(sheet.raw[r]?.[c.terminal]).toUpperCase(),
      rowNo: r + 1,
    });
  }
  if (units.length === 0) return null;
  const out = toRows(db, "CWIT", units);
  return {
    format: "CWIT-ITT-OUT",
    formatLabel: "CWIT – ITT Out Report for Trucking Company",
    terminal: "CWIT",
    sourceRows,
    rows: out.rows,
    display: out.display,
    notes: commonNotes("CWIT", out),
    links: [
      { source: "Container no", common: "Container No" },
      { source: "Length (40 / 20)", common: "Size", how: "40 → 40FT, 20 → 20FT" },
      { source: "(report issuer)", common: "Origin", how: "CWIT" },
      { source: "Terminal", common: "Destination" },
      { source: "Truck Visit Truck", common: "Truck", how: "LY5520 → matched to the fleet" },
      { source: "Unit Time Out", common: "Load Time", how: "date serial → yyyy-MM-dd HH:mm" },
      { source: "(not in report)", common: "Driver", how: "the driver the roster has on that truck and shift" },
      { source: "(not in report)", common: "Status", how: "In Transit" },
    ],
  };
}

function sagt(db: DB, sheet: SheetData): NormalisedReport | null {
  const h = findHeader(sheet, ["containerno", "enteredtime", "terminal"]);
  if (!h) return null;
  const c = h.cols;
  const units: Unit[] = [];
  for (let r = h.row + 1; r < sheet.raw.length; r++) {
    const container = str(sheet.raw[r]?.[c.containerno]);
    if (!container) continue;
    units.push({
      container: container.toUpperCase(),
      size: sizeOf(str(sheet.raw[r]?.[c.size ?? -1])),
      truck: str(sheet.raw[r]?.[c.trucknumber ?? -1]),
      loading: timeOf(sheet.raw[r]?.[c.enteredtime], str(sheet.text[r]?.[c.enteredtime])),
      dest: str(sheet.raw[r]?.[c.terminal]).toUpperCase(),
      rowNo: r + 1,
    });
  }
  if (units.length === 0) return null;
  const out = toRows(db, "SAGT", units);
  return {
    format: "SAGT-CONTAINER",
    formatLabel: "SAGT – Container Report (ITT Out)",
    terminal: "SAGT",
    sourceRows: units.length,
    rows: out.rows,
    display: out.display,
    notes: commonNotes("SAGT", out),
    links: [
      { source: "Container No", common: "Container No" },
      { source: "Size (20ft / 40ft)", common: "Size", how: "20ft → 20FT, 40ft → 40FT" },
      { source: "(report issuer)", common: "Origin", how: "SAGT" },
      { source: "Terminal", common: "Destination" },
      { source: "Truck Number", common: "Truck", how: "LY-6181 → matched to the fleet" },
      { source: "Entered Time", common: "Load Time", how: "“20-Oct 08:40” → yyyy-MM-dd HH:mm (year added)" },
      { source: "(not in report)", common: "Driver", how: "the driver the roster has on that truck and shift" },
      { source: "(not in report)", common: "Status", how: "In Transit" },
    ],
  };
}

/** Files already in the standard MTS template (our own column names, or close synonyms). */
function common(db: DB, sheet: SheetData): NormalisedReport | null {
  for (let r = 0; r < Math.min(10, sheet.raw.length); r++) {
    const headers = (sheet.raw[r] ?? []).map((v) => str(v));
    const m = suggestMapping(headers.filter(Boolean));
    if (!m.containerNo || !m.destinationTerminal) continue;
    const idx = (name?: string) => (name ? headers.indexOf(name) : -1);
    const cell = (row: number, name?: string) => {
      const i = idx(name);
      return i < 0 ? "" : str(sheet.raw[row]?.[i]);
    };
    const rows: CommonRow[] = [];
    const display: Record<string, string>[] = [];
    for (let k = r + 1; k < sheet.raw.length; k++) {
      if (!cell(k, m.containerNo)) continue;
      const t = (name?: string) => {
        const i = idx(name);
        return i < 0 ? "" : timeOf(sheet.raw[k]?.[i], str(sheet.text[k]?.[i]));
      };
      const row: CommonRow = {
        "Container No": cell(k, m.containerNo),
        Size: sizeOf(cell(k, m.containerSize)),
        Origin: cell(k, m.sourceTerminal),
        Destination: cell(k, m.destinationTerminal),
        Truck: cell(k, m.truckNo),
        Trailer: cell(k, m.trailerNo),
        Driver: cell(k, m.driver),
        "Load Time": t(m.loadingAt),
        "Discharge Time": t(m.dischargeAt),
        Status: cell(k, m.status),
      };
      rows.push(row);
      display.push({ ...row, "Source row(s)": `Row ${k + 1}` });
    }
    if (rows.length === 0) continue;
    return {
      format: "COMMON",
      formatLabel: "Standard MTS template",
      terminal: "CWIT",
      sourceRows: rows.length,
      rows,
      display,
      notes: ["The file already uses the common format, so no conversion was needed."],
      links: (Object.entries(m) as [string, string][]).map(([k, v]) => ({ source: v, common: COMMON_COLUMNS.find((c) => norm(c) === norm(k)) ?? k })),
    };
  }
  return null;
}

/** Detects the terminal layout and converts the file to the common format. Throws when the layout is not recognised. */
export function normaliseReport(db: DB, sheet: SheetData): NormalisedReport {
  const hit = cwit(db, sheet) ?? sagt(db, sheet) ?? common(db, sheet);
  if (!hit) throw new Error("This layout is not recognised. Expected a CWIT “ITT Out Report”, a SAGT “Container Report” or the standard MTS template.");
  return hit;
}

