import type { FuelRecord, GpsImport } from "@/types/fuel";
import { addDays, eachDay } from "@/lib/date-utils";
import { mulberry32, int } from "@/lib/prng";

/**
 * GPS (Track My Car) and fuel-station invoice records are generated per vehicle and kept as
 * SEPARATE records. Variances are deliberately planted on PM-003, PM-006 and PM-008.
 */
const VARIANCE: Record<string, number> = { "PM-003": 0.13, "PM-006": -0.1, "PM-008": 0.09 };

export function buildFuel(): { fuelRecords: FuelRecord[]; gpsImports: GpsImport[] } {
  const r = mulberry32(777);
  const recs: FuelRecord[] = [];
  let n = 0;
  const id = () => `FR-${String(++n).padStart(4, "0")}`;
  const stations = ["Ceypetco Peliyagoda", "LIOC Orugodawatta", "Ceypetco Kolonnawa", "Sinopec Wattala"];
  for (let v = 1; v <= 9; v++) {
    const vid = `PM-${String(v).padStart(3, "0")}`;
    const bias = VARIANCE[vid] ?? (r() - 0.5) * 0.06;
    for (const [from, to, importId] of [
      ["2026-10-01", "2026-10-31", "GPS-0001"],
      ["2026-11-01", "2026-11-12", "GPS-0002"],
    ] as const) {
      const days = eachDay(from, to);
      let totalGps = 0;
      for (let i = 0; i < days.length; i += 7) {
        const litres = int(r, 255, 345);
        totalGps += litres;
        recs.push({ id: id(), vehicleId: vid, date: days[Math.min(i + 6, days.length - 1)], source: "GPS", litres, distanceKm: Math.round(litres / 0.38), enteredBy: "Track My Car import", gpsImportId: importId });
      }
      const target = totalGps * (1 + bias);
      const fills = Math.max(2, Math.round(days.length / 9));
      let left = target;
      for (let f = 0; f < fills; f++) {
        const litres = f === fills - 1 ? Math.round(left) : Math.round(target / fills + int(r, -12, 12));
        left -= litres;
        recs.push({
          id: id(),
          vehicleId: vid,
          date: days[Math.min(days.length - 1, Math.floor(((f + 0.6) * days.length) / fills))],
          source: "Fuel Invoice",
          litres,
          amount: Math.round(litres * 3.1 * 100) / 100,
          station: stations[(v + f) % stations.length],
          invoiceNo: `FS-${20260000 + v * 100 + f + (from === "2026-11-01" ? 50 : 0)}`,
          enteredBy: "Tharindu Gamage",
        });
      }
    }
  }
  const gpsImports: GpsImport[] = [
    { id: "GPS-0001", fileName: "TrackMyCar_Fuel_Trips_2026-10.csv", uploadedAt: "2026-11-02T10:05", uploadedBy: "Nadeesha Perera", provider: "Track My Car", records: recs.filter((x) => x.gpsImportId === "GPS-0001").length, vehicles: 9, periodFrom: "2026-10-01", periodTo: "2026-10-31" },
    { id: "GPS-0002", fileName: "TrackMyCar_Fuel_Trips_2026-11-12.csv", uploadedAt: addDays("2026-11-13", 0) + "T08:20", uploadedBy: "Nadeesha Perera", provider: "Track My Car", records: recs.filter((x) => x.gpsImportId === "GPS-0002").length, vehicles: 9, periodFrom: "2026-11-01", periodTo: "2026-11-12" },
  ];
  return { fuelRecords: recs, gpsImports };
}
