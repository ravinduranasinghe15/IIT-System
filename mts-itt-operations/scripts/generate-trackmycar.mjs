// Generates public/documents/sample-trackmycar.csv – a Track My Car style daily fuel/trip export
// for PM-001..PM-009, 2026-11-01..2026-11-12 (deterministic, with some realistic variance).
// Usage: node scripts/generate-trackmycar.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.resolve(here, "../public/documents/sample-trackmycar.csv");

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
const rnd = mulberry32(20261112);
const int = (min, max) => min + Math.floor(rnd() * (max - min + 1));

const REG = ["LY-5516", "LY-5519", "LY-5520", "LY-5523", "LY-5525", "LY-5601", "LY-6178", "LY-6181", "LY-5321"];
// litres per km (fuel economy varies by truck; PM-003 / PM-008 burn noticeably more)
const L_PER_KM = [0.37, 0.39, 0.44, 0.36, 0.38, 0.41, 0.37, 0.43, 0.36];

const header = ["Vehicle", "Registration No", "Date", "Distance (km)", "Fuel Consumed (L)", "Idle Time (min)", "Stoppage Count", "Max Speed (km/h)"];
const rows = [header];

for (let v = 0; v < 9; v++) {
  for (let day = 1; day <= 12; day++) {
    const date = `2026-11-${String(day).padStart(2, "0")}`;
    const sunday = new Date(Date.UTC(2026, 10, day)).getUTCDay() === 0;
    const inWorkshop = v === 5 && day >= 11; // PM-006 in workshop
    let distance = inWorkshop ? 0 : sunday ? int(30, 80) : int(95, 185);
    let litres = Math.round(distance * L_PER_KM[v] * (0.96 + rnd() * 0.08) * 10) / 10;
    const idle = inWorkshop ? 0 : int(25, 140);
    litres = Math.round((litres + idle * 0.012) * 10) / 10;
    const stops = inWorkshop ? 0 : int(4, 15);
    const maxSpeed = inWorkshop ? 0 : int(62, 88);
    rows.push([`PM-${String(v + 1).padStart(3, "0")}`, REG[v], date, distance, litres, idle, stops, maxSpeed]);
  }
}

const ws = XLSX.utils.aoa_to_sheet(rows);
const csv = XLSX.utils.sheet_to_csv(ws);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, csv + "\n", "utf8");
console.log(`Wrote ${rows.length - 1} rows to ${outFile}`);
