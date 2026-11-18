import type { DB } from "@/types/db";
import type { ParsedSheet } from "./excel-parser";
import { parseLooseDate } from "./date-utils";

/** Track My Car (GPS) import helpers: column mapping suggestion and row validation (pure). */

export const GPS_FIELDS = [
  { key: "vehicle", label: "Vehicle (ID or registration)", required: true },
  { key: "date", label: "Date", required: true },
  { key: "litres", label: "Fuel consumed (L)", required: true },
  { key: "distanceKm", label: "Distance (km)", required: false },
  { key: "idleMin", label: "Idle time (min)", required: false },
  { key: "stops", label: "Stoppage count", required: false },
] as const;
export type GpsFieldKey = (typeof GPS_FIELDS)[number]["key"];
export type GpsMapping = Partial<Record<GpsFieldKey, string>>;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const SYN: Record<GpsFieldKey, string[]> = {
  vehicle: ["vehicle", "vehicleid", "vehicleno", "vehiclename", "registrationno", "registration", "regno", "reg", "unit", "asset", "truck", "truckno", "primemover"],
  date: ["date", "day", "tripdate", "reportdate", "datetime", "timestamp"],
  litres: ["fuelconsumedl", "fuelconsumed", "fuelused", "fuelusedl", "estimatedfuell", "estimatedfuel", "fuel", "fuell", "litres", "liters", "fuelconsumption", "consumedl"],
  distanceKm: ["distancekm", "distance", "mileage", "mileagekm", "km", "tripdistance", "tripdistancekm"],
  idleMin: ["idletimemin", "idletime", "idle", "idling", "idlingtime", "idlemin"],
  stops: ["stoppagecount", "stoppages", "stops", "stopcount", "numberofstops"],
};

export function suggestGpsMapping(headers: string[]): GpsMapping {
  const out: GpsMapping = {};
  const taken = new Set<string>();
  for (const f of GPS_FIELDS) {
    const hit = headers.find((h) => !taken.has(h) && SYN[f.key].includes(norm(h)));
    if (hit) {
      out[f.key] = hit;
      taken.add(hit);
    }
  }
  return out;
}

export type GpsRowStatus = "Valid" | "Overlap" | "Duplicate in file" | "Invalid";

export interface GpsRowResult {
  rowNo: number;
  status: GpsRowStatus;
  problems: string[];
  vehicleId: string | null;
  date: string | null;
  litres: number | null;
  distanceKm: number | null;
  idleMin: number | null;
  stops: number | null;
  raw: Record<string, string>;
}

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number.parseFloat(String(v).replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : null;
};

export function resolveVehicle(db: DB, value: unknown): string | null {
  const s = String(value ?? "").trim();
  if (!s) return null;
  const id = s.toUpperCase();
  const byId = db.primeMovers.find((p) => p.id === id);
  if (byId) return byId.id;
  const byReg = db.primeMovers.find((p) => norm(p.regNo) === norm(s));
  return byReg?.id ?? null;
}

/** Validate every row of a parsed file against the mapping and the existing GPS data. */
export function validateGpsRows(db: DB, sheet: ParsedSheet, mapping: GpsMapping): GpsRowResult[] {
  const periods = db.gpsImports;
  const hasGps = new Set(db.fuelRecords.filter((r) => r.source === "GPS" && r.gpsImportId).map((r) => `${r.gpsImportId}|${r.vehicleId}`));
  const seen = new Set<string>();
  return sheet.rows.map((raw, i) => {
    const get = (k: GpsFieldKey) => (mapping[k] ? raw[mapping[k] as string] : null);
    const problems: string[] = [];
    const vehicleId = resolveVehicle(db, get("vehicle"));
    if (!mapping.vehicle) problems.push("Vehicle column not mapped");
    else if (!vehicleId) problems.push(`Unknown vehicle "${String(get("vehicle") ?? "").trim() || "(blank)"}"`);
    const parsed = mapping.date ? parseLooseDate(get("date")) : null;
    const date = parsed && parsed !== "invalid" ? parsed.slice(0, 10) : null;
    if (!mapping.date) problems.push("Date column not mapped");
    else if (!date) problems.push(parsed === "invalid" ? "Invalid date" : "Missing date");
    const litres = toNum(get("litres"));
    if (!mapping.litres) problems.push("Fuel column not mapped");
    else if (litres === null) problems.push("Missing or non-numeric fuel litres");
    else if (litres < 0) problems.push("Negative fuel litres");
    else if (litres > 2000) problems.push("Implausible fuel litres (> 2,000 L in one record)");

    let status: GpsRowStatus = "Valid";
    if (problems.length) status = "Invalid";
    else if (vehicleId && date) {
      const k = `${vehicleId}|${date}`;
      if (seen.has(k)) {
        status = "Duplicate in file";
        problems.push("Same vehicle and date appears earlier in this file");
      } else {
        seen.add(k);
        const clash = periods.find((p) => date >= p.periodFrom && date <= p.periodTo && hasGps.has(`${p.id}|${vehicleId}`));
        if (clash) {
          status = "Overlap";
          problems.push(`Date falls in existing import ${clash.id} (${clash.periodFrom} to ${clash.periodTo}) for this vehicle`);
        }
      }
    }
    return {
      rowNo: i + 2,
      status,
      problems,
      vehicleId,
      date,
      litres,
      distanceKm: toNum(get("distanceKm")),
      idleMin: toNum(get("idleMin")),
      stops: toNum(get("stops")),
      raw: sheet.display[i] ?? {},
    };
  });
}
