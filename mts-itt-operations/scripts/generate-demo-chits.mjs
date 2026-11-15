// Generates the fixed DEMO chit pack (PNG images) plus the matching hard-coded extraction data module.
//   node scripts/generate-demo-chits.mjs
// Writes public/documents/chits/*.png and src/data/demo-chits.ts. Chits match the movements imported from
// MTS-Demo-Terminal-Report.xlsx (see scripts/generate-demo-report.mjs).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "documents", "chits");
fs.mkdirSync(outDir, { recursive: true });

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const D = "2026-11-13";
const iso = (hhmm) => `${D}T${hhmm}`;
const pretty = (hhmm) => `13 Nov 2026, ${hhmm}`;

// conf = [container, truck, driver, terminal, datetime, kind]
const CHITS = [
  { file: "LC-MSCU5401018.png", kind: "Loading", container: "MSCU5401018", truck: "PM-001", driver: "Nuwan Perera", terminal: "CWIT", time: "07:05", conf: [98, 96, 95, 99, 92, 99] },
  { file: "DC-MSCU5401018.png", kind: "Discharge", container: "MSCU5401018", truck: "PM-001", driver: "Nuwan Perera", terminal: "JCT", time: "07:55", conf: [97, 96, 94, 99, 93, 99] },
  { file: "LC-MAEU5402123.png", kind: "Loading", container: "MAEU5402123", truck: "PM-002", driver: "Kasun Fernado", terminal: "CWIT", time: "07:30", conf: [98, 95, 64, 99, 91, 99] }, // driver misread -> needs correction
  { file: "DC-MAEU5402123.png", kind: "Discharge", container: "MAEU5402123", truck: "PM-002", driver: "Kasun Fernando", terminal: "JCT", time: "08:25", conf: [96, 95, 93, 99, 92, 99] },
  { file: "LC-CMAU5403235.png", kind: "Loading", container: "CMAU5403235 / CMAU5403472", truck: "PM-003", driver: "Sampath Jayasinghe", terminal: "CWIT", time: "08:00", conf: [95, 96, 93, 99, 90, 99] },
  { file: "DC-CMAU5403235.png", kind: "Discharge", container: "CMAU5403235 / CMAU5403472", truck: "PM-003", driver: "Sampath Jayasinghe", terminal: "SAGT", time: "09:05", conf: [94, 96, 92, 99, 91, 99] },
  { file: "DC-HLCU5404343.png", kind: "Discharge", container: "HLCU5404348", truck: "PM-004", driver: "Chaminda Silva", terminal: "JCT", time: "09:30", conf: [95, 96, 94, 99, 93, 99] }, // container differs from the ledger -> mismatch exception
  { file: "LC-ONEU5405456.png", kind: "Loading", container: "ONEU5405456", truck: "PM-005", driver: "Ruwan Wickramasinghe", terminal: "CWIT", time: "09:10", conf: [97, 76, 93, 99, 91, 99] },
];

function svgFor(c) {
  const title = c.kind === "Loading" ? "LOADING CHIT" : "DISCHARGE CHIT";
  const rows = [
    ["Container(s)", c.container],
    ["Truck", c.truck],
    ["Driver", c.driver],
    ["Terminal", c.terminal],
    [c.kind === "Loading" ? "Loaded" : "Discharged", pretty(c.time)],
  ];
  const body = rows
    .map(
      ([k, v], i) =>
        `<text x="40" y="${176 + i * 46}" font-size="17" fill="#64748B" font-family="Arial">${esc(k)}</text><text x="210" y="${176 + i * 46}" font-size="21" fill="#1E293B" font-family="Courier New, monospace" font-weight="bold">${esc(v)}</text><line x1="40" y1="${188 + i * 46}" x2="560" y2="${188 + i * 46}" stroke="#CBD5E1" stroke-dasharray="4 4"/>`,
    )
    .join("");
  const h = 470;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${h}" viewBox="0 0 600 ${h}"><rect width="100%" height="100%" fill="#FBFAF4"/><rect x="12" y="12" width="576" height="${h - 24}" fill="none" stroke="#315D8A" stroke-width="3"/><text x="300" y="52" text-anchor="middle" font-size="16" fill="#315D8A" font-family="Arial" font-weight="bold">MARINE TRANSPORT SERVICES (PVT) LTD</text><text x="300" y="92" text-anchor="middle" font-size="28" fill="#142C4C" font-family="Arial" font-weight="bold">${title}</text><text x="300" y="118" text-anchor="middle" font-size="14" fill="#64748B" font-family="Arial">Inter-terminal transport · Supervisor copy</text><line x1="40" y1="134" x2="560" y2="134" stroke="#142C4C" stroke-width="1.5"/>${body}<path d="M70 ${h - 66} q26 -38 52 0 t52 0 t52 -12" stroke="#203E65" fill="none" stroke-width="2.5"/><text x="40" y="${h - 32}" font-size="14" fill="#64748B" font-family="Arial">Supervisor signature</text><text x="560" y="${h - 32}" text-anchor="end" font-size="12" fill="#DC2626" font-family="Arial">SAMPLE DEMO DOCUMENT</text></svg>`;
}

for (const c of CHITS) await sharp(Buffer.from(svgFor(c))).png().toFile(path.join(outDir, c.file));

const LABELS = ["Container Number", "Truck Number", "Driver Name", "Terminal", "Date and Time", "Loading/Discharge"];
const demo = CHITS.map((c) => ({
  fileName: c.file,
  docType: c.kind === "Loading" ? "Loading Chit" : "Discharge Chit",
  /** first container number of the movement this chit belongs to (matched against the ledger) */
  linkContainer: c.file.replace(/^(LC|DC)-/, "").replace(".png", ""),
  fields: [
    ["containerNo", c.container],
    ["truckNo", c.truck],
    ["driver", c.driver],
    ["terminal", c.terminal],
    ["datetime", iso(c.time)],
    ["kind", c.kind],
  ].map(([key, value], i) => ({ key, label: LABELS[i], value, confidence: c.conf[i] })),
}));

const ts = `// GENERATED by scripts/generate-demo-chits.mjs – do not edit by hand.
// Fixed demo chit pack (public/documents/chits). Extraction values are hard-coded exactly as printed on each chit.
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
`;
fs.writeFileSync(path.join(root, "src", "data", "demo-chits.ts"), ts);
console.log(`wrote ${CHITS.length} chits`);
