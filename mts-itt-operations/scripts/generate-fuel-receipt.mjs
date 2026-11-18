// Generates the sample fuel-station receipt used in the "Add fuel entry" demo.
//   node scripts/generate-fuel-receipt.mjs  ->  public/documents/sample-fuel-receipt.png
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "public", "documents", "sample-fuel-receipt.png");
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const rows = [
  ["Invoice No", "FS-20261113-0412"],
  ["Date", "13 Nov 2026   10:42 AM"],
  ["Vehicle", "LY-5516 (PM-001)"],
  ["Fuel", "Auto Diesel"],
  ["Quantity", "120.00 L"],
  ["Rate", "LKR 300.00 / L"],
  ["Odometer", "184,520 km"],
];
const W = 460;
const H = 640;
const body = rows
  .map(
    ([k, v], i) =>
      `<text x="36" y="${200 + i * 40}" font-size="15" fill="#64748B" font-family="Arial">${esc(k)}</text><text x="${W - 36}" y="${200 + i * 40}" text-anchor="end" font-size="17" fill="#1E293B" font-family="Courier New, monospace" font-weight="bold">${esc(v)}</text><line x1="36" y1="${210 + i * 40}" x2="${W - 36}" y2="${210 + i * 40}" stroke="#CBD5E1" stroke-dasharray="3 4"/>`,
  )
  .join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#F5F5F0"/><rect x="10" y="10" width="${W - 20}" height="${H - 20}" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/><text x="${W / 2}" y="58" text-anchor="middle" font-size="22" fill="#142C4C" font-family="Arial" font-weight="bold">LANKA FUEL STATION</text><text x="${W / 2}" y="82" text-anchor="middle" font-size="13" fill="#64748B" font-family="Arial">Peliyagoda · Colombo</text><text x="${W / 2}" y="106" text-anchor="middle" font-size="13" fill="#64748B" font-family="Arial">Tel: 011 000 0000</text><line x1="36" y1="124" x2="${W - 36}" y2="124" stroke="#142C4C" stroke-width="1.5"/><text x="${W / 2}" y="158" text-anchor="middle" font-size="18" fill="#142C4C" font-family="Arial" font-weight="bold">FUEL RECEIPT</text>${body}<line x1="36" y1="${200 + rows.length * 40 + 6}" x2="${W - 36}" y2="${200 + rows.length * 40 + 6}" stroke="#142C4C" stroke-width="1.5"/><text x="36" y="${200 + rows.length * 40 + 42}" font-size="18" fill="#142C4C" font-family="Arial" font-weight="bold">TOTAL</text><text x="${W - 36}" y="${200 + rows.length * 40 + 42}" text-anchor="end" font-size="24" fill="#142C4C" font-family="Courier New, monospace" font-weight="bold">LKR 36,000.00</text><text x="36" y="${H - 70}" font-size="12" fill="#64748B" font-family="Arial">Paid: Credit account · MTS (Pvt) Ltd</text><text x="${W / 2}" y="${H - 36}" text-anchor="middle" font-size="12" fill="#DC2626" font-family="Arial">SAMPLE DEMO RECEIPT – NOT A REAL DOCUMENT</text></svg>`;

await sharp(Buffer.from(svg)).png().toFile(out);
console.log("wrote", out, fs.statSync(out).size, "bytes");
