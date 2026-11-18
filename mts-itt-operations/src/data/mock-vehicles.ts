import type { PrimeMover, ServiceRecord, Trailer } from "@/types/vehicle";

const MAKES: [string, string, string, number][] = [
  ["Volvo", "FH 460", "Prime Mover 6x4", 2021],
  ["Scania", "R 450", "Prime Mover 6x4", 2020],
  ["Tata", "Prima 4938.S", "Prime Mover 6x4", 2019],
  ["Ashok Leyland", "U4923", "Prime Mover 6x4", 2022],
  ["Mercedes-Benz", "Actros 2646", "Prime Mover 6x4", 2021],
  ["Sinotruk", "HOWO 420", "Prime Mover 6x4", 2018],
  ["Volvo", "FM 440", "Prime Mover 6x4", 2020],
  ["Tata", "Prima 4028.S", "Prime Mover 6x4", 2019],
  ["Scania", "P 410", "Prime Mover 6x4", 2022],
];
const REG = ["LY-5516", "LY-5519", "LY-5520", "LY-5523", "LY-5525", "LY-5601", "LY-6178", "LY-6181", "LY-5321"];
const ODO = [312400, 398250, 441900, 186320, 275610, 468030, 334870, 421150, 142780];
const NEXT_SERVICE = ["2026-12-04", "2026-11-20", "2026-11-09", "2027-01-15", "2026-11-27", "2026-11-05", "2026-12-18", "2026-11-16", "2027-02-02"];

const pm = (n: number) => `PM-${String(n).padStart(3, "0")}`;
const tr = (n: number) => `TR-${String(n).padStart(3, "0")}`;

export const MOCK_PRIME_MOVERS: PrimeMover[] = MAKES.map(([make, model, vehicleType, year], i) => ({
  id: pm(i + 1),
  regNo: REG[i],
  vehicleType,
  make,
  model,
  year,
  trailerId: tr(i + 1),
  status: i === 5 ? "In Maintenance" : "Active",
  odometerKm: ODO[i],
  nextServiceDate: NEXT_SERVICE[i],
}));

const TRAILER_REG = ["WP TR-1101", "WP TR-1102", "WP TR-1103", "WP TR-1104", "WP TR-1105", "WP TR-1106", "WP TR-1107", "WP TR-1108", "WP TR-1109", "WP TR-1110", "WP TR-1111", "WP TR-1112", "WP TR-1113", "WP TR-1114"];

export const MOCK_TRAILERS: Trailer[] = TRAILER_REG.map((regNo, i) => ({
  id: tr(i + 1),
  regNo,
  trailerType: i % 3 === 2 ? "40ft Skeletal (extendable)" : "40ft Skeletal",
  capacity: "1 x 40FT or 2 x 20FT",
  primeMoverId: i < 9 ? pm(i + 1) : null,
  status: i === 5 ? "In Maintenance" : i >= 12 ? "Inactive" : "Active",
}));

/** Maintenance history (LKR). Completed logs count as money spent; Scheduled / Overdue ones are only planned. */
export const MOCK_SERVICE_RECORDS: ServiceRecord[] = (() => {
  const out: ServiceRecord[] = [];
  const add = (r: Omit<ServiceRecord, "id">) => out.push({ id: `SV-${String(out.length + 1).padStart(4, "0")}`, ...r });
  MAKES.forEach((_, i) => {
    const v = pm(i + 1);
    add({ vehicleId: v, date: "2026-06-12", serviceType: "Full Service", description: "Engine oil, filters, brake inspection, grease points", cost: 78000 + i * 3500, nextServiceDate: "2026-09-12", status: "Completed" });
    add({ vehicleId: v, date: "2026-09-10", serviceType: i % 2 ? "Brake & Tyre Service" : "Full Service", description: i % 2 ? "Brake pads replaced, tyre rotation" : "Engine oil, filters, coolant check", cost: 64000 + i * 5200, nextServiceDate: NEXT_SERVICE[i], status: "Completed" });
    // work inside the demo month (13 Oct – 13 Nov)
    if (i % 3 === 0) add({ vehicleId: v, date: "2026-10-21", serviceType: "Tyre Replacement", description: "Two rear tyres replaced and wheels balanced", cost: 185000 + i * 4000, nextServiceDate: NEXT_SERVICE[i], status: "Completed" });
    else if (i % 3 === 1) add({ vehicleId: v, date: "2026-10-27", serviceType: "Brake & Tyre Service", description: "Brake linings, air dryer service, tyre rotation", cost: 96000 + i * 3000, nextServiceDate: NEXT_SERVICE[i], status: "Completed" });
    else add({ vehicleId: v, date: "2026-11-04", serviceType: "Minor Repair", description: "Air leak fixed, lighting and wiring repair", cost: 22500 + i * 1500, nextServiceDate: NEXT_SERVICE[i], status: "Completed" });
  });
  add({ vehicleId: "PM-006", date: "2026-11-11", serviceType: "Transmission Repair", description: "Gearbox clutch assembly replacement (in workshop) – estimate", cost: 450000, nextServiceDate: "2026-11-05", status: "Scheduled" });
  add({ vehicleId: "PM-003", date: "2026-11-09", serviceType: "Service Due", description: "A-service overdue – awaiting workshop slot", cost: 0, nextServiceDate: "2026-11-09", status: "Overdue" });
  return out;
})();
