import type { DB } from "@/types/db";
import type { ImportRecord, ImportRowResult } from "@/types/import";
import { addDays, addHoursIso, demoToday, eachDay, operationalDay } from "@/lib/date-utils";
import { fnvHex } from "@/lib/prng";
import { nextId } from "@/lib/db-helpers";

export const DEFAULT_MAPPINGS = {
  CWIT: { containerNo: "Container No", containerSize: "Size", sourceTerminal: "Origin", destinationTerminal: "Destination", truckNo: "Truck", trailerNo: "Trailer", driver: "Driver", loadingAt: "Load Time", dischargeAt: "Discharge Time", status: "Status" },
  SAGT: { containerNo: "CNTR_NO", containerSize: "CNTR_SIZE", sourceTerminal: "FROM_TERMINAL", destinationTerminal: "TO_TERMINAL", truckNo: "PRIME_MOVER", trailerNo: "TRAILER_NO", driver: "DRIVER_NAME", loadingAt: "PICKUP_DT", dischargeAt: "DROP_DT", status: "MOVE_STATUS" },
  CICT: {},
} as const;

/** Historic daily terminal reports (op-days Nov 4–12) for CWIT & SAGT, built from the seeded ledger. */
export function buildImports(db: DB) {
  const today = demoToday();
  const days = eachDay(addDays(today, -9), addDays(today, -1));
  const terminals = ["CWIT", "SAGT"] as const;
  const uploaders = ["Nadeesha Perera", "Tharindu Gamage"];
  const records: ImportRecord[] = [];
  let k = 0;
  for (const day of days) {
    for (const terminal of terminals) {
      const mvs = db.movements.filter((m) => m.sourceTerminal === terminal && operationalDay(m.loadingAt ?? "1970-01-01T00:00") === day);
      if (!mvs.length) continue;
      const id = nextId(db, "import", "IMP-", 4);
      const fileName = `${terminal}_Daily_Report_${day}.xlsx`;
      const rows: ImportRowResult[] = mvs.map((m, i) => {
        m.origin = "Import";
        m.importId = id;
        m.sourceRowNo = i + 2;
        m.createdBy = "Terminal import";
        m.events[0] = { ...m.events[0], kind: "import", at: addHoursIso(`${addDays(day, 1)}T08:00`, k % 3), by: uploaders[k % 2], text: `Created from terminal import ${id} (row ${i + 2}).` };
        const warnings: string[] = [];
        if (!m.driverId) warnings.push("Driver missing");
        if (!m.dischargeAt) warnings.push("Discharge time missing");
        return {
          rowNo: i + 2,
          status: "Imported" as const,
          errors: [],
          warnings,
          data: { containerNo: m.containerNos.join(" / "), containerSize: m.containerSize, sourceTerminal: m.sourceTerminal, destinationTerminal: m.destinationTerminal, truckNo: m.primeMoverId ?? "", trailerNo: m.trailerId ?? "", driver: db.drivers.find((d) => d.id === m.driverId)?.name ?? "", loadingAt: m.loadingAt ?? "", dischargeAt: m.dischargeAt ?? "", status: m.status },
          raw: {},
          movementId: m.id,
        };
      });
      let failed = 0;
      let duplicate = 0;
      // a couple of historic problem rows for realism (kept, never discarded)
      if (k % 4 === 1) {
        rows.push({ rowNo: rows.length + 2, status: "Invalid", errors: ["Invalid container number format: 'MSCU12345'"], warnings: [], data: { containerNo: "MSCU12345", sourceTerminal: terminal, destinationTerminal: "JCT" }, raw: { "Container No": "MSCU12345" } });
        failed = 1;
      }
      if (k % 5 === 2 && mvs[0]) {
        rows.push({ rowNo: rows.length + 2, status: "Duplicate", errors: [], warnings: [], data: rows[0].data, raw: {}, duplicateOf: mvs[0].id });
        duplicate = 1;
      }
      const exceptionsRaised = db.exceptions.filter((e) => e.importId === id).length;
      records.push({
        id,
        fileName,
        fingerprint: fnvHex(`${fileName}:${mvs.length}`),
        terminal,
        uploadedBy: uploaders[k % 2],
        uploadedAt: addHoursIso(`${addDays(day, 1)}T08:00`, k % 3),
        total: rows.length,
        success: mvs.length,
        failed,
        duplicate,
        status: failed || duplicate ? "Completed with Issues" : "Completed",
        exceptionsRaised,
        mapping: { ...DEFAULT_MAPPINGS[terminal] },
        rows,
      });
      k += 1;
    }
  }
  // re-upload of the most recent CWIT file – rejected as a duplicate file
  const last = records.filter((r) => r.terminal === "CWIT").at(-1);
  if (last) {
    records.push({
      id: nextId(db, "import", "IMP-", 4),
      fileName: last.fileName,
      fingerprint: last.fingerprint,
      terminal: "CWIT",
      uploadedBy: "Tharindu Gamage",
      uploadedAt: addHoursIso(last.uploadedAt, 5),
      total: last.total,
      success: 0,
      failed: 0,
      duplicate: last.total,
      status: "Rejected – Duplicate File",
      exceptionsRaised: 0,
      mapping: last.mapping,
      rows: [],
      note: `Identical file fingerprint to ${last.id}. No movements created; nothing counted twice.`,
    });
  }
  db.imports = records.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}
