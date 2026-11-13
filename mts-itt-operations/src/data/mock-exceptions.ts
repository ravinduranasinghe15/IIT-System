import type { DB } from "@/types/db";
import type { ExceptionRecord, ExceptionType } from "@/types/exception";
import { DEMO_NOW, addDays, addHoursIso, demoToday, operationalDay } from "@/lib/date-utils";
import { detectIssues, raiseExceptions, scanMissingEvidence } from "@/lib/reconciliation";
import { nextId } from "@/lib/db-helpers";

/** Builds the seeded exception queue from the seeded movements (so exceptions and movements stay consistent). */
export function buildExceptions(db: DB, specials: Record<string, string>) {
  const actor = db.users[0];
  const today = demoToday();
  const mv = (id: string) => db.movements.find((m) => m.id === id)!;

  const manual = (name: string, type: ExceptionType, description: string, conflicts: ExceptionRecord["conflicts"], priority: ExceptionRecord["priority"] = "High") => {
    const m = mv(specials[name]);
    db.exceptions.unshift({
      id: nextId(db, "exception", "EX-", 4),
      movementId: m.id,
      containerNo: m.containerNos[0],
      type,
      sourceTerminal: m.sourceTerminal,
      priority,
      reportedAt: addHoursIso(m.dischargeAt ?? m.loadingAt!, 3),
      assignedTo: null,
      status: "Open",
      description,
      conflicts,
      comments: [],
      materialCorrection: true,
      importId: m.importId,
    });
  };

  const cm = mv(specials.containerMismatch);
  manual("containerMismatch", "Container Number Mismatch", "Terminal report lists a different container number for this truck movement than the chit/system record.", [
    { field: "Container Number", systemValue: cm.containerNos[0], sourceValue: `${cm.containerNos[0].slice(0, 7)}${String((Number(cm.containerNos[0].slice(7, 10)) + 18) % 1000).padStart(3, "0")}${cm.containerNos[0].slice(10)}` },
  ]);
  const dm = mv(specials.destMismatch);
  manual("destMismatch", "Destination Mismatch", "Terminal discharge report shows a different destination terminal than the dispatch record.", [
    { field: "Destination Terminal", systemValue: dm.destinationTerminal, sourceValue: dm.destinationTerminal === "JCT" ? "SAGT" : "JCT" },
  ]);
  const tm = mv(specials.truckMismatch);
  const pmReg = db.primeMovers.find((p) => p.id === tm.primeMoverId)!.regNo;
  manual("truckMismatch", "Truck Number Mismatch", "Truck number on terminal report does not match the prime mover on the driver log sheet.", [
    { field: "Prime Mover", systemValue: `${tm.primeMoverId} (${pmReg})`, sourceValue: `${pmReg.slice(0, -2)}${pmReg.slice(-1)}${pmReg.slice(-2, -1)}` },
  ]);

  // rule-based detections (rejected, damaged, no driver, missing arrival, duplicate, missing chits)
  for (const m of [...db.movements].reverse()) raiseExceptions(db, m, detectIssues(m, db), actor, m.importId);
  scanMissingEvidence(db, today, actor);

  // resolved / rejected explicit examples
  const rc = mv(specials.resolvedChit);
  db.exceptions.unshift({
    id: nextId(db, "exception", "EX-", 4),
    movementId: rc.id,
    containerNo: rc.containerNos[0],
    type: "Missing Discharge Chit",
    sourceTerminal: rc.sourceTerminal,
    priority: "Medium",
    reportedAt: addHoursIso(rc.dischargeAt!, 20),
    assignedTo: "Ranjith Herath",
    status: "Resolved",
    description: "No discharge chit attached when evidence reconciliation ran.",
    conflicts: [],
    comments: [
      { id: "C-seed-1", by: "Ranjith Herath", at: addHoursIso(rc.dischargeAt!, 26), text: "Chit collected from JCT gate office." },
    ],
    materialCorrection: false,
    resolvedBy: "Ranjith Herath",
    resolvedAt: addHoursIso(rc.dischargeAt!, 27),
    resolutionNote: "Discharge chit received and attached to the movement.",
  });
  const rj = mv(specials.rejectedExc);
  db.exceptions.unshift({
    id: nextId(db, "exception", "EX-", 4),
    movementId: rj.id,
    containerNo: rj.containerNos[0],
    type: "Truck Number Mismatch",
    sourceTerminal: rj.sourceTerminal,
    priority: "Low",
    reportedAt: addHoursIso(rj.dischargeAt!, 10),
    assignedTo: "Dinesh Kumarasinghe",
    status: "Rejected",
    description: "Terminal file used a truck alias that appears to differ from the master record.",
    conflicts: [{ field: "Prime Mover", systemValue: rj.primeMoverId ?? "—", sourceValue: "Alias used by terminal" }],
    comments: [{ id: "C-seed-2", by: "Dinesh Kumarasinghe", at: addHoursIso(rj.dischargeAt!, 12), text: "Terminal alias confirmed for the same truck – no discrepancy." }],
    materialCorrection: false,
    rejectReason: "Not a discrepancy – terminal alias for the same prime mover.",
    resolvedBy: "Dinesh Kumarasinghe",
    resolvedAt: addHoursIso(rj.dischargeAt!, 12),
  });

  // lifecycle for the auto-raised ones
  const cycle: ExceptionRecord["status"][] = ["Open", "Under Review", "Open", "Open", "Under Review"];
  const assignees = ["Ranjith Herath", "Kumudu Ekanayake", "Dinesh Kumarasinghe"];
  let i = 0;
  for (const e of db.exceptions) {
    const m = mv(e.movementId);
    if (e.status === "Resolved" || e.status === "Rejected") continue;
    const reported = addHoursIso(m.dischargeAt ?? m.loadingAt!, e.type.startsWith("Missing") && e.type !== "Missing Arrival Time" ? 20 : 3);
    e.reportedAt = reported > DEMO_NOW ? DEMO_NOW : reported;
    const day = operationalDay(e.reportedAt);
    if (day < addDays(today, -5) && ["Rejected Delivery", "Damaged Container"].includes(e.type)) {
      e.status = "Resolved";
      e.assignedTo = "Dinesh Kumarasinghe";
      e.resolvedBy = "Dinesh Kumarasinghe";
      e.resolvedAt = addHoursIso(e.reportedAt, 30);
      e.resolutionNote = e.type === "Damaged Container" ? "Damage confirmed against chit photos; claim logged outside Phase 1 scope." : "Rejection confirmed with terminal; movement retained as non-billable.";
      e.managerApproved = true;
      e.managerApprovedBy = "Dinesh Kumarasinghe";
      e.comments.push({ id: `C-seed-${e.id}`, by: "Dinesh Kumarasinghe", at: addHoursIso(e.reportedAt, 29), text: "Reviewed evidence. Retaining status and history." });
    } else {
      e.status = cycle[i % cycle.length];
      if (e.status === "Under Review") e.assignedTo = assignees[i % assignees.length];
      i += 1;
    }
  }
  // fix-ups for historic resolved items that would otherwise stay blocked
  for (const e of db.exceptions) {
    if (e.status === "Resolved" && e.type === "Driver Information Missing") {
      const m = mv(e.movementId);
      if (!m.driverId) m.driverId = "DR-010";
    }
  }
  db.exceptions.sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
}
