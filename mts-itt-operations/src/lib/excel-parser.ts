import * as XLSX from "xlsx";
import { fnvHex } from "./prng";
import { STD_FIELDS, type ColumnMapping, type StdFieldKey } from "@/types/import";

export interface ParsedSheet {
  fileName: string;
  fileSizeKb: number;
  fingerprint: string;
  sheetName: string;
  sheetNames: string[];
  headers: string[];
  /** raw typed values (numbers for dates/serials) – used for validation */
  rows: Record<string, unknown>[];
  /** display strings as shown in Excel – used for preview */
  display: Record<string, string>[];
}

async function fingerprintOf(buf: ArrayBuffer): Promise<string> {
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const digest = await crypto.subtle.digest("SHA-256", buf);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
  } catch {
    /* fall back below */
  }
  return fnvHex(new Uint8Array(buf));
}

/** Reads XLSX / XLS / CSV with SheetJS (real parsing – not simulated). */
export async function parseSpreadsheet(file: File, sheetIndex = 0): Promise<ParsedSheet> {
  const buf = await file.arrayBuffer();
  const fingerprint = await fingerprintOf(buf);
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[Math.min(sheetIndex, wb.SheetNames.length - 1)];
  if (!sheetName) throw new Error("The file does not contain any worksheet.");
  const ws = wb.Sheets[sheetName];
  const aoaRaw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: false });
  const aoaText = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: "", blankrows: false });
  if (aoaRaw.length === 0) throw new Error("The worksheet is empty.");

  const headerRow = aoaRaw[0].map((h, i) => String(h ?? "").trim() || `Column ${i + 1}`);
  const seen = new Map<string, number>();
  const headers = headerRow.map((h) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    return n === 1 ? h : `${h} (${n})`;
  });

  const rows: Record<string, unknown>[] = [];
  const display: Record<string, string>[] = [];
  for (let r = 1; r < aoaRaw.length; r++) {
    const raw: Record<string, unknown> = {};
    const disp: Record<string, string> = {};
    headers.forEach((h, c) => {
      raw[h] = aoaRaw[r][c] ?? null;
      disp[h] = String(aoaText[r]?.[c] ?? "").trim();
    });
    rows.push(raw);
    display.push(disp);
  }
  return {
    fileName: file.name,
    fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
    fingerprint,
    sheetName,
    sheetNames: wb.SheetNames,
    headers,
    rows,
    display,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const SYNONYMS: Record<StdFieldKey, string[]> = {
  containerNo: ["containerno", "containernumber", "container", "cntrno", "cntr", "contno", "ctnrno", "unitno", "unitnumber"],
  containerSize: ["size", "containersize", "cntrsize", "length", "type", "isotype", "sz"],
  sourceTerminal: ["origin", "from", "fromterminal", "source", "sourceterminal", "pickupterminal", "loadterminal", "originterminal"],
  destinationTerminal: ["destination", "to", "toterminal", "dest", "destinationterminal", "deliveryterminal", "dropterminal"],
  truckNo: ["truck", "truckno", "trucknumber", "primemover", "primemoverno", "pm", "vehicle", "vehicleno", "prime"],
  trailerNo: ["trailer", "trailerno", "trailernumber", "chassis", "chassisno"],
  driver: ["driver", "drivername", "drivercode", "driverid", "operator"],
  loadingAt: ["loadtime", "loadingtime", "loading", "pickupdt", "pickup", "pickuptime", "gateout", "gateouttime", "loaded", "loadingdatetime", "start"],
  dischargeAt: ["dischargetime", "discharge", "dropdt", "drop", "droptime", "gatein", "gateintime", "delivered", "arrival", "arrivaltime", "dischargedatetime", "end"],
  status: ["status", "movestatus", "movementstatus", "state"],
};

/** Suggest a mapping of standard fields to the file's column headers (best-effort, user can override). */
export function suggestMapping(headers: string[], remembered?: ColumnMapping): ColumnMapping {
  const out: ColumnMapping = {};
  const taken = new Set<string>();
  for (const f of STD_FIELDS) {
    const rem = remembered?.[f.key];
    if (rem && headers.includes(rem)) {
      out[f.key] = rem;
      taken.add(rem);
    }
  }
  for (const f of STD_FIELDS) {
    if (out[f.key]) continue;
    const syn = SYNONYMS[f.key];
    const hit = headers.find((h) => !taken.has(h) && syn.includes(norm(h)));
    if (hit) {
      out[f.key] = hit;
      taken.add(hit);
    }
  }
  return out;
}
