// Generates the downloadable sample terminal reports used by the demo import wizard.
//   node scripts/generate-samples.mjs
// Writes public/documents/sample-cwit.xlsx (text date cells) and sample-sagt.xlsx (true Excel date cells).
// Operational day 2026-11-13. Contains valid rows plus deliberate problems (invalid / missing container numbers,
// invalid date, missing driver / truck, exact duplicate row, and duplicates of containers already in the seeded ledger).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public", "documents");
fs.mkdirSync(outDir, { recursive: true });

// ---- ISO 6346 (replicates src/lib/container.ts) ----
const LETTER_VALUES = {};
(() => {
  let v = 10;
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (v % 11 === 0) v++;
    LETTER_VALUES[ch] = v;
    v++;
  }
})();
function checkDigit(first10) {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = first10[i];
    const val = /[A-Z]/.test(c) ? LETTER_VALUES[c] : Number(c);
    sum += val * 2 ** i;
  }
  return (sum % 11) % 10;
}
const mk = (prefix, serial) => {
  const body = prefix + String(serial).padStart(6, "0");
  return body + checkDigit(body);
};
const breakDigit = (cn) => cn.slice(0, 10) + ((Number(cn[10]) + 3) % 10);

const D = "2026-11-13";
const t = (hhmm) => `${D} ${hhmm}`;
const serial = (hhmm) => Date.parse(`${D}T${hhmm}:00Z`) / 86400000 + 25569;

function writeBook(file, sheetName, headers, rows, widths, dateCols) {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  for (const c of dateCols ?? []) {
    for (let r = 1; r <= rows.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.t === "n") cell.z = "yyyy-mm-dd hh:mm";
    }
  }
  ws["!cols"] = widths.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  fs.writeFileSync(path.join(outDir, file), XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  console.log(`wrote ${file}: ${rows.length} rows`);
}

// ================= CWIT (text date cells) =================
const cw4 = mk("HLCU", 520455);
const cwitRows = [
  [mk("MSCU", 520110), "20", "CWIT", "JCT", "PM-001", "TR-001", "Nuwan Perera", t("07:10"), t("07:58"), "Completed"],
  [mk("MAEU", 520223), "40", "CWIT", "JCT", "PM-002", "TR-002", "Kasun Fernando", t("07:35"), t("08:30"), "Completed"],
  [`${mk("CMAU", 520317)} / ${mk("CMAU", 520341)}`, "20", "CWIT", "SAGT", "PM-003", "TR-003", "Sampath Jayasinghe", t("08:05"), t("09:10"), "Completed"],
  [cw4, "40", "CWIT", "JCT", "PM-004", "TR-004", "Chaminda Silva", t("08:40"), t("09:35"), "Completed"],
  [mk("ONEU", 520569), "20FT", "CWIT", "JCT", "PM-005", "TR-005", "Ruwan Wickramasinghe", t("09:15"), t("10:20"), "Completed"],
  [mk("EGHU", 520688), "40FT", "CWIT", "JCT", "PM-007", "TR-007", "Pradeep Kumara", t("09:50"), t("10:41"), "Completed"],
  [mk("OOLU", 520812), "40", "CWIT", "JCT", "PM-009", "TR-009", "Janaka Bandara", t("11:00"), t("11:55"), "Completed"],
  [mk("COSU", 520927), "20", "CWIT", "JCT", "PM-001", "TR-001", "Nuwan Perera", t("11:40"), t("12:35"), "Completed"],
  [mk("ZIMU", 521133), "20", "CWIT", "JCT", "PM-003", "TR-003", "Sampath Jayasinghe", t("13:05"), t("14:10"), "Completed"],
  [mk("MSCU", 521359), "40", "CWIT", "JCT", "PM-005", "TR-005", "Ruwan Wickramasinghe", t("14:35"), "", "In Transit"],
  [mk("MAEU", 521462), "20", "CWIT", "SAGT", "PM-007", "TR-007", "Pradeep Kumara", t("15:20"), t("16:15"), "Completed"],
  // --- deliberate problems ---
  [breakDigit(mk("TGHU", 521571)), "20", "CWIT", "JCT", "PM-008", "TR-008", "Lakmal Gunawardena", t("15:50"), t("16:45"), "Completed"], // wrong check digit
  ["MSCU12345", "40", "CWIT", "JCT", "PM-009", "TR-009", "Janaka Bandara", t("16:10"), t("17:00"), "Completed"], // bad format
  ["", "20", "CWIT", "JCT", "PM-001", "TR-001", "Nuwan Perera", t("16:30"), t("17:10"), "Completed"], // missing container number
  [mk("HLCU", 521777), "40", "CWIT", "JCT", "PM-002", "TR-002", "Kasun Fernando", "2026-13-45 08:15", t("09:05"), "Completed"], // invalid date
  [mk("ONEU", 521888), "20", "CWIT", "JCT", "PM-003", "TR-003", "", t("10:10"), t("11:05"), "Completed"], // missing driver
  [mk("EGHU", 521999), "40", "CWIT", "JCT", "", "", "Chaminda Silva", t("12:10"), t("13:05"), "Completed"], // missing truck
  [cw4, "40", "CWIT", "JCT", "PM-004", "TR-004", "Chaminda Silva", t("08:40"), t("09:35"), "Completed"], // exact duplicate of row 4
  ["MSCU4342857", "20", "CWIT", "JCT", "PM-001", "TR-001", "Nuwan Perera", t("07:19"), t("08:11"), "Completed"], // already in ledger (MV-0385)
  ["EGHU4343314", "20", "CWIT", "JCT", "PM-002", "TR-002", "Kasun Fernando", t("17:12"), "", "In Transit"], // already in ledger (MV-0388)
];
writeBook(
  "sample-cwit.xlsx",
  "CWIT Daily Report",
  ["Container No", "Size", "Origin", "Destination", "Truck", "Trailer", "Driver", "Load Time", "Discharge Time", "Status"],
  cwitRows,
  [16, 8, 9, 12, 9, 9, 22, 18, 18, 12],
);

// ================= SAGT (true Excel date cells) =================
const sg4 = mk("HLCU", 530488);
const dtc = (hhmm) => (hhmm ? { t: "n", v: serial(hhmm) } : "");
const sagtRaw = [
  [mk("MSCU", 530101), "22G1", "SAGT", "JCT", "WP LL-4521", "WP TR-1101", "Nuwan Perera", "07:12", "08:02", "COMPLETED"],
  [mk("MAEU", 530214), "45G1", "SAGT", "JCT", "PM-002", "TR-002", "Kasun Fernando", "07:40", "08:36", "COMPLETED"],
  [`${mk("CMAU", 530322)} + ${mk("CMAU", 530346)}`, "20FT", "SAGT", "JCT", "WP CAT-7714", "WP TR-1103", "Sampath Jayasinghe", "08:20", "09:25", "COMPLETED"],
  [sg4, "40FT", "SAGT", "JCT", "PM-004", "TR-004", "Chaminda Silva", "09:00", "09:58", "COMPLETED"],
  [mk("ONEU", 530503), "20FT", "SAGT", "JCT", "WP LK-9047", "WP TR-1105", "Ruwan Wickramasinghe", "09:35", "10:31", "COMPLETED"],
  [mk("EGHU", 530617), "40FT", "SAGT", "CWIT", "PM-007", "TR-007", "Pradeep Kumara", "10:15", "11:12", "COMPLETED"],
  [mk("OOLU", 530729), "22G1", "SAGT", "JCT", "WP CAV-8826", "WP TR-1108", "Lakmal Gunawardena", "10:50", "11:44", "COMPLETED"],
  [mk("COSU", 530835), "40FT", "SAGT", "JCT", "PM-009", "TR-009", "Janaka Bandara", "11:30", "12:22", "COMPLETED"],
  [mk("YMLU", 530942), "20FT", "SAGT", "JCT", "PM-001", "", "Nuwan Perera", "12:10", "13:05", "COMPLETED"],
  [mk("ZIMU", 531058), "40FT", "SAGT", "JCT", "PM-002", "TR-002", "Kasun Fernando", "13:00", "13:52", "REJECTED"],
  [mk("TGHU", 531163), "40FT", "SAGT", "JCT", "PM-005", "TR-005", "Ruwan Wickramasinghe", "13:45", "14:44", "DAMAGED"],
  [mk("CAIU", 531277), "20FT", "SAGT", "JCT", "PM-003", "TR-003", "Sampath Jayasinghe", "14:30", "", "IN TRANSIT"],
  [mk("MSCU", 531384), "20FT", "SAGT", "JCT", "PM-099", "", "Pradeep Kumara", "15:10", "16:02", "COMPLETED"], // truck not in fleet master data
  [mk("HLCU", 531491), "40FT", "SAGT", "JCT", "PM-004", "TR-004", "R. Fernando", "15:45", "16:40", "COMPLETED"], // driver not in master data
  // --- deliberate problems ---
  [breakDigit(mk("MAEU", 531596)), "20FT", "SAGT", "JCT", "PM-008", "TR-008", "Lakmal Gunawardena", "11:15", "12:05", "COMPLETED"], // wrong check digit
  ["", "40FT", "SAGT", "JCT", "PM-009", "TR-009", "Janaka Bandara", "16:05", "16:58", "COMPLETED"], // missing container number
  [mk("ONEU", 531705), "40FT", "SAGT", "JCT", "PM-001", "TR-001", "Nuwan Perera", "not a date", "09:10", "COMPLETED"], // invalid date
  [mk("EGHU", 531816), "20FT", "SAGT", "JCT", "PM-002", "TR-002", "", "08:45", "09:40", "COMPLETED"], // missing driver
  [mk("OOLU", 531927), "40FT", "SAGT", "JCT", "", "", "Chaminda Silva", "10:05", "10:58", "COMPLETED"], // missing truck
  [sg4, "40FT", "SAGT", "JCT", "PM-004", "TR-004", "Chaminda Silva", "09:00", "09:58", "COMPLETED"], // exact duplicate of row 4
  ["CAIU4343170", "40FT", "SAGT", "JCT", "PM-005", "TR-005", "Ruwan Wickramasinghe", "16:50", "", "IN TRANSIT"], // already in ledger (MV-0387)
];
const sagtRows = sagtRaw.map((r) => [r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7] === "not a date" ? r[7] : dtc(r[7]), dtc(r[8]), r[9]]);
writeBook(
  "sample-sagt.xlsx",
  "SAGT Movements",
  ["CNTR_NO", "CNTR_SIZE", "FROM_TERMINAL", "TO_TERMINAL", "PRIME_MOVER", "TRAILER_NO", "DRIVER_NAME", "PICKUP_DT", "DROP_DT", "MOVE_STATUS"],
  sagtRows,
  [16, 10, 14, 12, 14, 12, 22, 18, 18, 13],
  [7, 8],
);
