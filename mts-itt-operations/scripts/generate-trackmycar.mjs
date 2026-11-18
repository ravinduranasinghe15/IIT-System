// Generates public/documents/13.11.2026_Trips-track-my-car.xlsx – a DEMO Track My Car "Trips" export in the exact layout
// MTS receives from their GPS system (title row, then per day: title row, header row, one row per trip, blank row).
// Covers PM-001..PM-009, 13.10.2026 – 12.11.2026, one month (deterministic). The real export has no fuel readings – the importer
// totals trips per vehicle per day and estimates fuel from distance.
//   node scripts/generate-trackmycar.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, "../public/documents/13.11.2026_Trips-track-my-car.xlsx");

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261113);
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const REG = ["LY-5516", "LY-5519", "LY-5520", "LY-5523", "LY-5525", "LY-5601", "LY-6178", "LY-6181", "LY-5321"];
// the GPS system shows the driver name in capitals (as in MTS's real export)
const DRIVER = ["NUWAN", "KASUN", "SAMPATH", "CHAMINDA", "RUWAN", "PRADEEP", "LAKMAL", "JANAKA", "KUMUDU"];
const PLACES = [
  "Colombo",
  "Colombo, L B Gate",
  "Colombo, St. Bastian",
  "Colombo, Seram Gate",
  "Colombo, St. Bastian, Port Access Elevated Highway",
  "Colombo, St. Bastian, L B Gate, Bandaranayake Quay",
  "Colombo, St. Bastian, Gas Paha Junction, Wharf Road",
  "SAGT",
  "CWIT",
  "CICT",
  "JCT",
  "ECT",
  "Pattiya, Peliyagoda Watta, 4th Mile Post, Colombo - Kandy Road",
  "Heiyanthuduwa",
  "Waragoda, Thorana Junction",
];

const pad = (n) => String(n).padStart(2, "0");
const dmy = (d) => `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`;
const hms = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
const FIRST = Date.UTC(2026, 9, 13);
const DAYS = 31;
const day = (i) => new Date(FIRST + i * 86400000);

const aoa = [];
const merges = [];
aoa.push([`13.11.2026 08:12:41 (0.612)sTrips from 13.10.2026 00:00 to 13.11.2026 00:00`, "", "", "", "", "", "", "", ""]);
for (let di = 0; di < DAYS; di++) {
  const d = day(di);
  const next = day(di + 1);
  const sunday = d.getUTCDay() === 0;
  if (di > 0) aoa.push(new Array(9).fill(""));
  merges.push({ s: { c: 0, r: aoa.length }, e: { c: 8, r: aoa.length } });
  aoa.push([`${dmy(d)} 00:00 - ${dmy(next)} 00:00`, "", "", "", "", "", "", "", ""]);
  aoa.push(["Vehicle", "Mileage", "Trip start time", "Trip end time", "Duration", "Geofence", "Start place", "Stop place", "Driver name"]);
  for (let v = 0; v < 9; v++) {
    const inWorkshop = v === 5 && di >= 29; // PM-006 in workshop from 11 Nov
    if (inWorkshop) continue;
    const total = sunday ? int(30, 80) : int(95, 185);
    const n = sunday ? int(1, 2) : int(2, 5);
    // cut the day into n consecutive trips; each trip ends where the vehicle stopped, the next starts a little later
    const cuts = [0];
    for (let k = 1; k < n; k++) cuts.push(Math.round((k / n) * 86400 + (rnd() - 0.5) * (86400 / n) * 0.5));
    cuts.push(86400);
    const trips = [];
    for (let k = 0; k < n; k++) {
      const startS = k === 0 ? int(0, 600) : cuts[k] + int(60, 900);
      const endS = cuts[k + 1];
      if (endS - startS < 300) continue;
      trips.push({ startS, endS });
    }
    const weight = trips.map((t) => (t.endS - t.startS) * (0.4 + rnd()));
    const wsum = weight.reduce((a, b) => a + b, 0);
    let left = total;
    trips.forEach((t, k) => {
      const km = k === trips.length - 1 ? left : Math.round((total * weight[k]) / wsum * 100) / 100;
      left = Math.round((left - km) * 100) / 100;
      const endLabel = t.endS >= 86400 ? `00:00:00 ${dmy(next)}` : `${hms(t.endS)} ${dmy(d)}`;
      aoa.push([REG[v], `${km.toFixed(2)} km`, `${hms(t.startS)} ${dmy(d)}`, endLabel, hms(t.endS - t.startS), "", pick(PLACES), pick(PLACES), DRIVER[v]]);
    });
  }
}

const ws = XLSX.utils.aoa_to_sheet(aoa);
ws["!merges"] = merges;
ws["!cols"] = [10, 12, 22, 22, 11, 10, 30, 42, 14].map((wch) => ({ wch }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Worksheet");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log(`Wrote ${aoa.filter((r) => /^LY-/.test(r[0])).length} trips over ${DAYS} days to ${outFile}`);
