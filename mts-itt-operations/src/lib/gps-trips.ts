import * as XLSX from "xlsx";
import { fingerprintOf, type ParsedSheet } from "./excel-parser";

/**
 * Track My Car "Trips" export (the file MTS receives from their GPS system):
 *   row 1   "03.11.2026 09:08:16 (0.775)sTrips from 01.10.2026 00:00 to 04.11.2026 00:00"
 *   then, per day:  a title row "01.10.2026 00:00 - 02.10.2026 00:00", a header row
 *   (Vehicle, Mileage, Trip start time, Trip end time, Duration, Geofence, Start place, Stop place, Driver name),
 *   one row per trip ("24.83 km", "00:08:04 01.10.2026", …) and a blank row.
 * The export has NO fuel readings, so it is flattened to one row per vehicle per day (distance, trips, driving time)
 * and the fuel is ESTIMATED from the distance. Real fuel comes from the fuel-station slips / invoices.
 */
export const GPS_LITRES_PER_KM = 0.38;

const DAY_TITLE = /^(\d{2})\.(\d{2})\.(\d{4}) \d{2}:\d{2} - /;

const secs = (hms: string) => {
  const [h, m, s] = hms.split(":").map(Number);
  return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
};

/** Returns a flattened sheet, or null when the file is not in the Track My Car trips layout. */
export async function parseTrackMyCarTrips(file: File): Promise<ParsedSheet | null> {
  if (!/\.xlsx?$/i.test(file.name)) return null;
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) return null;
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], { header: 1, raw: false, defval: "", blankrows: true }).map((r) => r.map((c) => String(c ?? "").trim()));
  const isHeader = (r: string[]) => r[0] === "Vehicle" && r[1] === "Mileage" && /trip start/i.test(r[2] ?? "");
  if (!aoa.some(isHeader)) return null;

  const acc = new Map<string, { vehicle: string; date: string; km: number; trips: number; driveSec: number; driver: string }>();
  let date = "";
  for (const r of aoa) {
    const day = DAY_TITLE.exec(r[0] ?? "");
    if (day) {
      date = `${day[3]}-${day[2]}-${day[1]}`;
      continue;
    }
    if (!date || isHeader(r) || !r[0] || !/ km$/i.test(r[1] ?? "")) continue;
    const km = Number.parseFloat(r[1]);
    if (!Number.isFinite(km)) continue;
    const key = `${r[0]}|${date}`;
    const cur = acc.get(key) ?? { vehicle: r[0], date, km: 0, trips: 0, driveSec: 0, driver: r[8] ?? "" };
    cur.km += km;
    cur.trips += 1;
    cur.driveSec += secs(r[4] ?? "");
    acc.set(key, cur);
  }
  if (acc.size === 0) return null;

  const list = [...acc.values()].sort((a, b) => (a.vehicle < b.vehicle ? -1 : a.vehicle > b.vehicle ? 1 : a.date < b.date ? -1 : 1));
  const headers = ["Vehicle", "Date", "Distance (km)", "Estimated Fuel (L)", "Trips", "Driving Time (min)", "Driver"];
  const rows: Record<string, unknown>[] = [];
  const display: Record<string, string>[] = [];
  for (const t of list) {
    const km = Math.round(t.km * 100) / 100;
    const litres = Math.round(km * GPS_LITRES_PER_KM * 10) / 10;
    const mins = Math.round(t.driveSec / 60);
    rows.push({ Vehicle: t.vehicle, Date: t.date, "Distance (km)": km, "Estimated Fuel (L)": litres, Trips: t.trips, "Driving Time (min)": mins, Driver: t.driver });
    display.push({ Vehicle: t.vehicle, Date: t.date, "Distance (km)": String(km), "Estimated Fuel (L)": String(litres), Trips: String(t.trips), "Driving Time (min)": String(mins), Driver: t.driver });
  }
  return {
    fileName: file.name,
    fileSizeKb: Math.max(1, Math.round(file.size / 1024)),
    fingerprint: await fingerprintOf(buf),
    sheetName,
    sheetNames: wb.SheetNames,
    headers,
    rows,
    display,
  };
}
