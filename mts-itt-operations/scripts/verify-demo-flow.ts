/* eslint-disable @typescript-eslint/no-explicit-any */
// Runs the documented demo flow (see DEMO-FLOW.md) against the real business logic and prints what it produces:
//   npx tsx scripts/verify-demo-flow.ts
// terminal imports -> full chit pack -> driver log pack -> manual reviews of the flagged documents.
import fs from "node:fs";
import { createSeedDB } from "@/data/seed";
import { readSheetData, normaliseReport } from "@/lib/report-formats";
import { processRows } from "@/lib/import-processor";
import { commitImport } from "@/lib/mutations/import";
import { DEFAULT_MAPPINGS } from "@/data/mock-imports";
import { DEMO_DRIVER_LOG } from "@/data/demo-chits";
import { ALL_DEMO_CHITS } from "@/data/demo-chit-pack";
import { DEMO_LOG_PACK } from "@/data/demo-driver-logs";
import { submitDemoChit, uploadDocument, runExtraction, verifyExtraction } from "@/lib/mutations/evidence";
import { billableStatus } from "@/lib/eligibility";
import { movementMismatches } from "@/lib/cross-check";
import { driverLogStats } from "@/lib/driver-logs";

const tally = (db: any, list: any[]) => {
  const t: Record<string, number> = {};
  for (const m of list) t[billableStatus(m, db)] = (t[billableStatus(m, db)] ?? 0) + 1;
  return t;
};

async function main() {
  const db: any = createSeedDB();
  console.log("STEP 1  Terminal imports");
  for (const f of ["CWIT-ITT-Out-Report-sample.xlsx", "SAGT-Container-Report-sample.xlsx"]) {
    const s = await readSheetData(new File([fs.readFileSync("public/documents/" + f)], f));
    const r = normaliseReport(db, s);
    const mapping = { ...DEFAULT_MAPPINGS.CWIT };
    const res = commitImport(db, { fileName: f, fingerprint: s.fingerprint, terminal: r.terminal, mapping, rows: processRows({ db, terminal: r.terminal, mapping, rows: r.rows, display: r.display }), includeDuplicateRows: [] });
    console.log(`  ${f}: ${res.createdMovementIds.length} movements, ${res.record.exceptionsRaised} exceptions`);
  }
  const all = db.movements;
  const day13 = all.filter((m: any) => m.loadingAt?.startsWith("2026-11-13"));
  console.log(`  movements ${all.length} (13 Nov: ${day13.length}), with a driver from the roster: ${all.filter((m: any) => m.driverId).length}`);

  console.log("STEP 2  Full chit pack (180 chits)");
  for (const c of ALL_DEMO_CHITS()) submitDemoChit(db, c);
  const chits = db.documents.filter((d: any) => d.docType.endsWith("Chit"));
  console.log(`  chits ${chits.length}: verified automatically ${chits.filter((d: any) => d.ocr.verified).length}, waiting for a person ${chits.filter((d: any) => !d.ocr.verified).length}`);
  console.log(`  movements Completed: ${all.filter((m: any) => m.status === "Completed").length}`);

  console.log("STEP 3  Driver logs (the demo log + the pack)");
  const sheets: any[] = [{ fileName: DEMO_DRIVER_LOG.fileName, driverId: DEMO_DRIVER_LOG.driverId, primeMoverId: DEMO_DRIVER_LOG.primeMoverId, date: DEMO_DRIVER_LOG.date, shift: DEMO_DRIVER_LOG.shift }, ...DEMO_LOG_PACK.filter((r) => !r.spare)];
  for (const s of sheets) {
    const r = uploadDocument(db, { name: s.fileName, docType: "Driver Log Sheet", mime: "image/png", sizeKb: 30, movementId: null, driverLog: { driverId: s.driverId, primeMoverId: s.primeMoverId, date: s.date, shift: s.shift } });
    runExtraction(db, r.doc.id);
  }
  const logs = db.documents.filter((d: any) => d.docType === "Driver Log Sheet");
  const st = driverLogStats(db);
  console.log(`  sheets ${logs.length}: verified automatically ${logs.filter((d: any) => d.ocr.verified).length}, waiting for a person ${logs.filter((d: any) => !d.ocr.verified).length}; movements covered ${st.covered}, still without a log ${st.missing.length}`);
  console.log("  billing status of all movements:", JSON.stringify(tally(db, all)));

  console.log("\n13 NOV MOVEMENTS");
  for (const m of day13.sort((a: any, b: any) => a.id.localeCompare(b.id))) {
    const docs = db.documents.filter((d: any) => d.movementId === m.id);
    const plate = db.primeMovers.find((p: any) => p.id === m.primeMoverId)?.regNo ?? m.primeMoverId;
    const manual = docs.filter((d: any) => !d.ocr?.verified).map((d: any) => d.name);
    console.log(`  ${m.id} ${m.containerNos.join("+").padEnd(25)} ${String(plate).padEnd(8)} ${String(m.status).padEnd(10)} ${billableStatus(m, db).padEnd(20)} ${manual.length ? "manual: " + manual.join(", ") : ""}`);
  }

  console.log("\nSTEP 4  A person reviews what is left (verify every waiting chit / sheet as read)");
  for (const d of db.documents.filter((x: any) => x.ocr && !x.ocr.verified)) verifyExtraction(db, d.id, d.ocr.fields);
  console.log("  billing status of all movements:", JSON.stringify(tally(db, all)));
  const left = all.filter((m: any) => movementMismatches(db, m).length).length;
  console.log(`  movements that still show a mismatch between documents: ${left} (people reviewed them)`);
  console.log(`  open exceptions: ${db.exceptions.filter((e: any) => e.status === "Open" || e.status === "Under Review").length}`);
}
main();
