// Generates the two DEMO terminal reports in the terminals' real layouts, plus the matching chit pack.
//   node scripts/generate-sample-reports.mjs
// Writes:
//   public/documents/CWIT-ITT-Out-Report-sample.xlsx   (CWIT "ITT Out Report for Trucking Company" layout)
//   public/documents/SAGT-Container-Report-sample.xlsx (SAGT "Container Report" layout)
//   public/documents/chits/*.png and src/data/demo-chits.ts (chits for 4 of the imported movements)
// The data is made to match this system: fleet plates, active routes, container numbers with valid ISO 6346 check digits.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "public", "documents");
const chitDir = path.join(docs, "chits");
fs.mkdirSync(chitDir, { recursive: true });
for (const f of fs.readdirSync(chitDir)) fs.unlinkSync(path.join(chitDir, f));

// ---- ISO 6346 ----
const LETTER = {};
(() => {
  let v = 10;
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (v % 11 === 0) v++;
    LETTER[ch] = v;
    v++;
  }
})();
const check = (s) => {
  let sum = 0;
  for (let i = 0; i < 10; i++) sum += (/[A-Z]/.test(s[i]) ? LETTER[s[i]] : Number(s[i])) * 2 ** i;
  return (sum % 11) % 10;
};
const cn = (prefix, serial) => {
  const b = prefix + String(serial).padStart(6, "0");
  return b + check(b);
};

const DAY = "2026-11-13";
const serial = (hhmm) => Date.parse(`${DAY}T${hhmm}:00Z`) / 86400000 + 25569;

// ================= CWIT layout =================
// time, container, length, destination, truck (no hyphen, as CWIT writes it)
const cwitData = [
  ["07:16", cn("FSCU", 892356), "40", "SAGT", "LY5516"], // movement A
  ["07:21", cn("MRSU", 341106), "40", "SAGT", "LY5519"], // movement B
  ["07:29", cn("CAAU", 461783), "40", "SAGT", "LY5520"],
  ["08:07", cn("HASU", 519003), "40", "JCT", "LY5523"],
  ["08:30", cn("TCNU", 739587), "40", "JCT", "LY5525"],
  ["09:10", cn("MSKU", 178379), "20", "SAGT", "LY6178"], // pair on one truck
  ["09:10", cn("TCLU", 475849), "20", "SAGT", "LY6178"],
  ["10:35", cn("CSNU", 758293), "40", "JCT", "LY6181"],
  ["12:26", cn("CAAU", 755492), "40", "SAGT", "LY5321"],
  ["14:37", cn("TXGU", 796372), "40", "JCT", "LY5516"],
  ["15:48", cn("UETU", 696426), "40", "SAGT", "LY5999"], // truck not in the fleet -> exceptions
];
{
  const H = ["Sno", "", "Unit Time Out", "", "", "Container no ", "", "Type ISO", "", "Length", "", "", "Line", "Original Truck Company", "Truck Visit Truck", "Unit ITT Carrier", "I/B Vessel  Reference", "", "Terminal", "Move ID"];
  const aoa = [];
  for (let i = 0; i < 6; i++) aoa.push(new Array(20).fill(""));
  aoa[1][1] = "Colombo West International Terminal (Pvt) Limited";
  aoa.push(H);
  const lines = ["OOC", "MKL", "CMA", "COC", "HLL"];
  cwitData.forEach((r, i) => {
    const row = new Array(20).fill("");
    row[0] = i + 1;
    row[2] = { t: "n", v: serial(r[0]) };
    row[5] = r[1];
    row[7] = r[2] === "20" ? "22G1" : "45G1";
    row[9] = r[2];
    row[12] = lines[i % 5];
    row[13] = "MTS";
    row[14] = r[4];
    row[15] = "TCN26006WS";
    row[16] = "26E643N";
    row[18] = r[3];
    row[19] = "XFEROUT";
    aoa.push(row);
  });
  aoa.push(new Array(20).fill(""));
  // summary block like the real report (the importer must ignore it)
  const s1 = new Array(20).fill("");
  [s1[0], s1[2], s1[5], s1[7], s1[9]] = ["Original Truck Company", "Terminal", "20", "40", "45"];
  aoa.push(s1);
  const cnt20 = cwitData.filter((r) => r[2] === "20").length;
  const cnt40 = cwitData.length - cnt20;
  const s2 = new Array(20).fill("");
  [s2[0], s2[2], s2[5], s2[7], s2[9]] = ["MTS", "SAGT", String(cnt20), String(cnt40), "0"];
  aoa.push(s2);
  const s3 = new Array(20).fill("");
  [s3[0], s3[2], s3[5], s3[7], s3[9]] = ["Total", "", String(cnt20), String(cnt40), "0"];
  aoa.push(s3);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (let r = 7; r < 7 + cwitData.length; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 2 })];
    if (cell) cell.z = "m/d/yyyy h:mm AM/PM";
  }
  ws["!cols"] = [6, 3, 22, 3, 3, 16, 3, 10, 3, 8, 3, 3, 8, 22, 18, 16, 20, 3, 10, 10].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ITT Out Report for Trucking Com");
  fs.writeFileSync(path.join(docs, "CWIT-ITT-Out-Report-sample.xlsx"), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// ================= SAGT layout =================
// time, container, size, destination, truck (with hyphen, as SAGT writes it)
const sagtData = [
  ["08:40", cn("MSKU", 588463), "20ft", "CWIT", "LY-6181"], // movement C (pair)
  ["08:40", cn("MRKU", 958276), "20ft", "CWIT", "LY-6181"],
  ["09:01", cn("ECMU", 736156), "40ft", "CWIT", "LY-5525"], // movement D
  ["09:09", cn("ECMU", 702191), "40ft", "JCT", "LY-5516"],
  ["09:19", cn("MRKU", 989559), "20ft", "CWIT", "LY-5519"],
  ["09:19", cn("SEGU", 277285), "20ft", "CWIT", "LY-5519"],
  ["09:23", cn("TCKU", 676686), "40ft", "JCT", "LY-5523"],
  ["11:36", cn("MRKU", 575811), "40ft", "CWIT", "LY-5520"],
  ["13:05", cn("TCLU", 536066), "40ft", "JCT", "LY-6178"],
  ["14:20", cn("OOCU", 703671), "40ft", "CWIT", "LY-5321"],
  ["15:05", cn("HASU", 516700), "40ft", "JCT", "LY-5525"],
  ["16:10", cn("CAAU", 705796), "40ft", "CWIT", "LY-5516"],
];
{
  const H = ["Seq No", "Container No", "Size", "TEU", "Trucking Company", "Truck Number", "Entered Time", "Terminal", "XFER Group"];
  const aoa = [H];
  sagtData.forEach((r, i) => {
    aoa.push([String(i + 1).padStart(2, "0"), r[1], r[2], r[2] === "20ft" ? 1 : 2, "MARRINE", r[4], `13-Nov ${r[0]}`, r[3], "ITT OUT"]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [8, 14, 7, 6, 18, 12, 14, 10, 10].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Container Report");
  fs.writeFileSync(path.join(docs, "SAGT-Container-Report-sample.xlsx"), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

// ================= chit pack (4 movements x loading + discharge) =================
const iso = (hhmm) => `${DAY}T${hhmm}`;
const pretty = (hhmm) => `13 Nov 2026, ${hhmm}`;
// Each truck has one assigned driver (DR-00N <-> PM-00N), so the driver on a chit is fixed.
const DRIVER = { "LY-5516": "Nuwan Perera", "LY-5519": "Kasun Fernando", "LY-5525": "Ruwan Wickramasinghe", "LY-6181": "Lakmal Gunawardena" };
// conf = [container, truck, driver, terminal, datetime, kind]
const CHITS = [
  { kind: "Loading", link: cwitData[0][1], container: cwitData[0][1], truck: "LY-5516", driver: DRIVER["LY-5516"], terminal: "CWIT", time: "07:16", conf: [98, 96, 95, 99, 93, 99] },
  { kind: "Discharge", link: cwitData[0][1], container: cwitData[0][1], truck: "LY-5516", driver: DRIVER["LY-5516"], terminal: "SAGT", time: "08:12", conf: [97, 96, 94, 99, 92, 99] },
  { kind: "Loading", link: cwitData[1][1], container: cwitData[1][1], truck: "LY-5519", driver: "Kasun Fernado", terminal: "CWIT", time: "07:21", conf: [98, 95, 64, 99, 91, 99] }, // driver name misread -> needs correction
  { kind: "Discharge", link: cwitData[1][1], container: cwitData[1][1], truck: "LY-5519", driver: DRIVER["LY-5519"], terminal: "SAGT", time: "08:20", conf: [96, 95, 93, 99, 92, 99] },
  { kind: "Loading", link: sagtData[0][1], container: `${sagtData[0][1]} / ${sagtData[1][1]}`, truck: "LY-6181", driver: DRIVER["LY-6181"], terminal: "SAGT", time: "08:40", conf: [95, 96, 93, 99, 90, 99] },
  { kind: "Discharge", link: sagtData[0][1], container: `${sagtData[0][1]} / ${sagtData[1][1]}`, truck: "LY-6181", driver: DRIVER["LY-6181"], terminal: "CWIT", time: "09:35", conf: [94, 96, 92, 99, 91, 99] },
  { kind: "Loading", link: sagtData[2][1], container: sagtData[2][1], truck: "LY-5525", driver: DRIVER["LY-5525"], terminal: "SAGT", time: "09:01", conf: [97, 95, 93, 99, 92, 99] },
  { kind: "Discharge", link: sagtData[2][1], container: sagtData[2][1], truck: "LY-5525", driver: DRIVER["LY-5525"], terminal: "CWIT", time: "10:00", conf: [94, 95, 94, 99, 92, 99] },
  // MV-0005 (driver Ruwan Wickramasinghe, LY-5525): CWIT -> JCT
  { kind: "Loading", link: cwitData[4][1], container: cwitData[4][1], truck: "LY-5525", driver: DRIVER["LY-5525"], terminal: "CWIT", time: "08:30", conf: [97, 96, 94, 99, 93, 99] },
  { kind: "Discharge", link: cwitData[4][1], container: cwitData[4][1], truck: "LY-5525", driver: DRIVER["LY-5525"], terminal: "JCT", time: "09:25", conf: [96, 95, 94, 99, 92, 99] },
].map((c) => ({ ...c, file: `${c.kind === "Loading" ? "LC" : "DC"}-${c.link}.png` }));

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function svgFor(c) {
  const title = c.kind === "Loading" ? "LOADING CHIT" : "DISCHARGE CHIT";
  const rows = [
    ["Container(s)", c.container],
    ["Truck", c.truck],
    ["Driver", c.driver],
    ["Terminal", c.terminal],
    [c.kind === "Loading" ? "Loaded" : "Discharged", pretty(c.time)],
  ];
  const big = c.container.length > 18;
  const body = rows
    .map(
      ([k, v], i) =>
        `<text x="40" y="${186 + i * 50}" font-size="17" fill="#64748B" font-family="Arial">${esc(k)}</text><text x="${i === 0 && big ? 40 : 210}" y="${186 + i * 50 + (i === 0 && big ? 24 : 0)}" font-size="${i === 0 && big ? 19 : 21}" fill="#1E293B" font-family="Courier New, monospace" font-weight="bold">${esc(v)}</text><line x1="40" y1="${198 + i * 50 + (i === 0 && big ? 24 : 0)}" x2="560" y2="${198 + i * 50 + (i === 0 && big ? 24 : 0)}" stroke="#CBD5E1" stroke-dasharray="4 4"/>`,
    )
    .join("");
  const h = 520;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${h}" viewBox="0 0 600 ${h}"><rect width="100%" height="100%" fill="#FBFAF4"/><rect x="12" y="12" width="576" height="${h - 24}" fill="none" stroke="#315D8A" stroke-width="3"/><text x="300" y="52" text-anchor="middle" font-size="16" fill="#315D8A" font-family="Arial" font-weight="bold">MARINE TRANSPORT SERVICES (PVT) LTD</text><text x="300" y="92" text-anchor="middle" font-size="28" fill="#142C4C" font-family="Arial" font-weight="bold">${title}</text><text x="300" y="118" text-anchor="middle" font-size="14" fill="#64748B" font-family="Arial">Inter-terminal transport · Supervisor copy</text><line x1="40" y1="134" x2="560" y2="134" stroke="#142C4C" stroke-width="1.5"/>${body}<path d="M70 ${h - 66} q26 -38 52 0 t52 0 t52 -12" stroke="#203E65" fill="none" stroke-width="2.5"/><text x="40" y="${h - 32}" font-size="14" fill="#64748B" font-family="Arial">Supervisor signature</text><text x="560" y="${h - 32}" text-anchor="end" font-size="12" fill="#DC2626" font-family="Arial">SAMPLE DEMO DOCUMENT</text></svg>`;
}
for (const c of CHITS) await sharp(Buffer.from(svgFor(c))).png().toFile(path.join(chitDir, c.file));

const LABELS = ["Container Number", "Truck Number", "Driver Name", "Terminal", "Date and Time", "Loading/Discharge"];
const demo = CHITS.map((c) => ({
  fileName: c.file,
  docType: c.kind === "Loading" ? "Loading Chit" : "Discharge Chit",
  linkContainer: c.link,
  fields: [
    ["containerNo", c.container],
    ["truckNo", c.truck],
    ["driver", c.driver],
    ["terminal", c.terminal],
    ["datetime", iso(c.time)],
    ["kind", c.kind],
  ].map(([key, value], i) => ({ key, label: LABELS[i], value, confidence: c.conf[i] })),
}));
// ================= driver log sheet (Ruwan Wickramasinghe, LY-5525, Morning, 2 trips = MV-0005 + MV-0012) =================
const logDir = path.join(docs, "driver-logs");
fs.mkdirSync(logDir, { recursive: true });
for (const f of fs.readdirSync(logDir)) fs.unlinkSync(path.join(logDir, f));
const LOG = {
  file: "LOG-2026-11-13-Morning-LY5525.png",
  driver: DRIVER["LY-5525"],
  lorry: "LY 5525",
  shift: "Morning",
  date: DAY,
  trips: [
    { from: "CWIT", container: cwitData[4][1], size: "40", to: "JCT" },
    { from: "SAGT", container: sagtData[2][1], size: "40", to: "CWIT" },
  ],
};
function logSvg() {
  const W = 900, rowH = 44, top = 250;
  const hand = 'font-family="Segoe Script, Brush Script MT, cursive" fill="#1D3A8A"';
  let y = top;
  const lines = [];
  const header = (k, v, i) => `<rect x="300" y="${40 + i * 52}" width="560" height="52" fill="none" stroke="#111" stroke-width="2"/><text x="312" y="${74 + i * 52}" font-size="24" font-family="Courier New, monospace" font-weight="bold">${k}</text><text x="${i === 0 ? 500 : 580}" y="${76 + i * 52}" font-size="${i === 0 ? 24 : 28}" ${hand}>${esc(v)}</text>`;
  const head = [["Driver Name", LOG.driver], ["Lorry Number", LOG.lorry], ["Shift", LOG.shift]].map(([k, v], i) => header(k, v, i)).join("");
  const cols = `<rect x="40" y="${top - 52}" width="820" height="46" fill="none" stroke="#111" stroke-width="2"/><text x="52" y="${top - 21}" font-size="22" font-family="Courier New, monospace" font-weight="bold">Date</text><text x="190" y="${top - 21}" font-size="22" font-family="Courier New, monospace" font-weight="bold">NO</text><text x="270" y="${top - 21}" font-size="22" font-family="Courier New, monospace" font-weight="bold">Container Number</text><text x="580" y="${top - 21}" font-size="20" font-family="Courier New, monospace" font-weight="bold">20'' / 40</text><text x="730" y="${top - 21}" font-size="20" font-family="Courier New, monospace" font-weight="bold">TERMINAL</text>`;
  const dateTxt = `<text x="52" y="${top + 28}" font-size="24" ${hand}>${LOG.date.split("-").reverse().join(".")}</text>`;
  for (const t of ["CWIT", "SAGT"]) {
    lines.push(`<rect x="40" y="${y}" width="820" height="${rowH}" fill="none" stroke="#111"/><text x="450" y="${y + 30}" text-anchor="middle" font-size="24" font-family="Courier New, monospace" font-weight="bold">FROM ${t}</text>`);
    y += rowH;
    for (const trip of LOG.trips.filter((x) => x.from === t)) {
      lines.push(`<rect x="40" y="${y}" width="820" height="${rowH}" fill="none" stroke="#111"/><text x="270" y="${y + 32}" font-size="28" ${hand}>${trip.container}</text><text x="640" y="${y + 32}" font-size="28" ${hand}>${trip.size}</text><text x="750" y="${y + 32}" font-size="28" ${hand}>${trip.to}</text>`);
      y += rowH;
    }
    for (let i = 0; i < 2; i++) {
      lines.push(`<rect x="40" y="${y}" width="820" height="${rowH}" fill="none" stroke="#111"/>`);
      y += rowH;
    }
  }
  const H = y + 70;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#FFFFFF"/><rect x="40" y="30" width="820" height="${top - 90}" fill="none" stroke="#111" stroke-width="2"/><text x="60" y="110" font-size="64" font-family="Arial Black, Arial" font-weight="bold" fill="#1E293B">MTS</text><text x="60" y="140" font-size="14" font-family="Arial" fill="#475569">Marine Transport Services (Pvt) Ltd.</text>${head}${cols}${dateTxt}${lines.join("")}<ellipse cx="640" cy="${top + 132}" rx="44" ry="34" fill="none" stroke="#1D3A8A" stroke-width="3"/><text x="640" y="${top + 146}" text-anchor="middle" font-size="40" ${hand}>${LOG.trips.length}</text><text x="860" y="${H - 20}" text-anchor="end" font-size="12" fill="#DC2626" font-family="Arial">SAMPLE DEMO DOCUMENT</text></svg>`;
}
await sharp(Buffer.from(logSvg())).png().toFile(path.join(logDir, LOG.file));
const logFields = [
  ["driver", "Driver Name", LOG.driver, 94],
  ["truckNo", "Lorry Number", LOG.lorry, 96],
  ["shift", "Shift", LOG.shift, 98],
  ["date", "Date", LOG.date, 95],
  ...LOG.trips.map((t, i) => [`trip${i + 1}`, `Trip ${i + 1}`, `${t.container} | ${t.size} | ${t.from} > ${t.to}`, 93 - i]),
  ["tripTotal", "Trips written (circled)", String(LOG.trips.length), 91],
].map(([key, label, value, confidence]) => ({ key, label, value, confidence }));
const demoLog = { fileName: LOG.file, driverId: "DR-005", primeMoverId: "PM-005", date: LOG.date, shift: LOG.shift, fields: logFields };

const ts = `// GENERATED by scripts/generate-sample-reports.mjs – do not edit by hand.
// Fixed demo chit pack (public/documents/chits) for movements imported from the two sample terminal reports.
import type { DocType, OcrField } from "@/types/evidence";

export interface DemoChit {
  fileName: string;
  docType: DocType;
  /** Container number used to find the movement this chit belongs to */
  linkContainer: string;
  fields: OcrField[];
}

export const DEMO_CHIT_DIR = "/documents/chits/";
export const DEMO_CHITS: DemoChit[] = ${JSON.stringify(demo, null, 2)};

export const demoChitByName = (name: string) => DEMO_CHITS.find((c) => c.fileName.toLowerCase() === name.toLowerCase());

/** Fixed demo driver log sheet (public/documents/driver-logs) – Ruwan Wickramasinghe, LY-5525, covers MV-0005 and MV-0012. */
export interface DemoDriverLog {
  fileName: string;
  driverId: string;
  primeMoverId: string;
  date: string;
  shift: "Morning" | "Afternoon" | "Night";
  fields: OcrField[];
}
export const DEMO_DRIVER_LOG_DIR = "/documents/driver-logs/";
export const DEMO_DRIVER_LOG: DemoDriverLog = ${JSON.stringify(demoLog, null, 2)};
export const demoDriverLogByName = (name: string) => (DEMO_DRIVER_LOG.fileName.toLowerCase() === name.toLowerCase() ? DEMO_DRIVER_LOG : undefined);
`;
fs.writeFileSync(path.join(root, "src", "data", "demo-chits.ts"), ts);
console.log("CWIT rows:", cwitData.length, "SAGT rows:", sagtData.length, "chits:", CHITS.length);
