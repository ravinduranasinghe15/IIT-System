import type { Movement, MovementStatus } from "@/types/movement";
import type { TerminalCode } from "@/types/terminal";
import type { EvidenceDoc } from "@/types/evidence";
import { DEMO_NOW, addHoursIso, demoToday, eachDay, operationalDay } from "@/lib/date-utils";
import { makeContainerNo } from "@/lib/container";
import { chance, int, mulberry32, pick } from "@/lib/prng";
import { dr, pm } from "./mock-drivers";

export const SEED_START_DAY = "2026-10-01";
const PREFIXES = ["MSCU", "MAEU", "CMAU", "HLCU", "ONEU", "EGHU", "TGHU", "OOLU", "COSU", "YMLU", "ZIMU", "CAIU"];

export interface SeedMovements {
  movements: Movement[];
  docs: EvidenceDoc[];
  /** Named special-case movements used to build matching exceptions */
  specials: Record<string, string>;
}

type Draft = Omit<Movement, "id" | "events" | "createdAt" | "updatedAt" | "createdBy" | "pendingApproval"> & { key?: string };

export function generateMovements(): SeedMovements {
  const r = mulberry32(20261113);
  const today = demoToday();
  let serial = 410000;
  const newCn = () => makeContainerNo(pick(r, PREFIXES), (serial += int(r, 3, 97)));
  const drafts: Draft[] = [];

  eachDay(SEED_START_DAY, today).forEach((day, dayIdx) => {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    const isToday = day === today;
    const count = isToday ? 8 : dow === 0 ? int(r, 4, 6) : int(r, 8, 11);
    const offsets = Array.from({ length: count }, () => int(r, 0, 1439)).sort((a, b) => a - b);
    for (const off of offsets) {
      const loadingAt = addHoursIso(`${day}T07:00`, off / 60);
      if (loadingAt > DEMO_NOW) continue;
      const cict = day >= "2026-11-04" && chance(r, 0.09);
      const source: TerminalCode = cict ? "CICT" : chance(r, 0.52) ? "CWIT" : "SAGT";
      const destination: TerminalCode = source === "CWIT" && !chance(r, 0.62) ? "SAGT" : "JCT";
      const size = chance(r, 0.58) ? "20FT" : "40FT";
      const two = size === "20FT" && chance(r, 0.3);
      let k = int(r, 1, 9);
      if (day >= "2026-11-11" && k === 6) k = 7;
      const hour = Number(loadingAt.slice(11, 13));
      const wantShift = hour >= 7 && hour < 19 ? "Morning" : "Night";
      const pmDriverIdx = k - 1;
      const baseShiftOf = ["Morning", "Night", "Morning", "Night", "Rotating", "Morning", "Night", "Rotating", "Morning"][pmDriverIdx];
      const useOwn = baseShiftOf === wantShift || baseShiftOf === "Rotating";
      const driverNo = useOwn ? k : 10 + ((k + dayIdx) % 5);
      const dischargeAt = addHoursIso(loadingAt, int(r, 25, 75) / 60);
      let status: MovementStatus = "Completed";
      let discharge: string | null = dischargeAt;
      if (dischargeAt > DEMO_NOW) {
        status = "In Transit";
        discharge = null;
      }
      drafts.push({
        containerNos: two ? [newCn(), newCn()] : [newCn()],
        containerSize: size,
        sourceTerminal: source,
        destinationTerminal: destination,
        primeMoverId: pm(k),
        trailerId: `TR-${String(k).padStart(3, "0")}`,
        driverId: dr(driverNo),
        loadingAt,
        dischargeAt: discharge,
        status,
        notes: "",
        origin: "Seed",
      });
    }
    if (isToday) {
      // Scheduled (not yet loaded) work for the rest of today's operational day
      for (const t of ["18:15", "18:40", "19:20"]) {
        let k = int(r, 1, 9);
        if (k === 6) k = 7;
        const two = chance(r, 0.3);
        const size = two ? "20FT" : chance(r, 0.5) ? "20FT" : "40FT";
        drafts.push({
          containerNos: two ? [newCn(), newCn()] : [newCn()],
          containerSize: size,
          sourceTerminal: chance(r, 0.5) ? "CWIT" : "SAGT",
          destinationTerminal: "JCT",
          primeMoverId: pm(k),
          trailerId: `TR-${String(k).padStart(3, "0")}`,
          driverId: dr(10 + int(r, 0, 4)),
          loadingAt: `${day}T${t}`,
          dischargeAt: null,
          status: "Pending",
          notes: "Scheduled loading time – awaiting terminal release.",
          origin: "Seed",
        });
      }
    }
  });

  // ---- Special demo cases (picked from the last ~10 operational days) ----
  const pool = drafts
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => d.status === "Completed" && operationalDay(d.loadingAt!) >= "2026-11-03" && operationalDay(d.loadingAt!) <= "2026-11-11");
  const used = new Set<number>();
  const take = (pred: (d: Draft) => boolean = () => true): Draft => {
    const hit = pool.find(({ d, i }) => !used.has(i) && pred(d));
    if (!hit) throw new Error("seed: no candidate for special case");
    used.add(hit.i);
    return hit.d;
  };
  const sp: Record<string, Draft> = {};
  sp.missingLoading = take();
  sp.missingDischarge = take();
  sp.containerMismatch = take((d) => d.containerNos.length === 1);
  sp.destMismatch = take((d) => d.sourceTerminal === "CWIT");
  sp.truckMismatch = take();
  sp.driverMissing = take();
  sp.driverMissing2 = take();
  sp.rejected = take();
  sp.damaged = take((d) => d.containerSize === "40FT");
  sp.missingArrival = take();
  sp.dupOriginal = take((d) => d.containerNos.length === 1);
  sp.resolvedChit = take((d) => operationalDay(d.loadingAt!) <= "2026-11-07");
  sp.rejectedExc = take((d) => operationalDay(d.loadingAt!) <= "2026-11-08");
  sp.twin = take((d) => d.containerSize === "20FT" && d.containerNos.length === 1);

  sp.missingLoading.key = "missingLoading";
  sp.missingDischarge.key = "missingDischarge";
  sp.containerMismatch.status = "Under Review";
  sp.destMismatch.status = "Under Review";
  sp.truckMismatch.status = "Under Review";
  sp.driverMissing.driverId = null;
  sp.driverMissing2.driverId = null;
  sp.rejected.status = "Rejected";
  sp.rejected.notes = "Rejected at JCT gate: seal number mismatch. Chits retained.";
  sp.damaged.status = "Damaged";
  sp.damaged.notes = "Container corner casting damage noted at discharge. Photos attached to chit.";
  sp.missingArrival.dischargeAt = null;
  sp.twin.containerNos = [newCn(), newCn()];
  sp.twin.notes = "Two 20FT containers on one trailer – ONE physical journey, two container units.";

  const dup: Draft = { ...sp.dupOriginal, loadingAt: addHoursIso(sp.dupOriginal.loadingAt!, 0.5), dischargeAt: addHoursIso(sp.dupOriginal.dischargeAt!, 0.5), status: "Under Review", notes: "Same container reported twice in the terminal file.", key: "dup" };
  drafts.push(dup);

  // generic rejected / damaged (older movements)
  const generic = drafts.filter((d) => d.status === "Completed" && !Object.values(sp).includes(d) && d !== dup && operationalDay(d.loadingAt!) < "2026-11-12");
  generic.forEach((d) => {
    const x = r();
    if (x < 0.022) {
      d.status = "Rejected";
      d.notes = "Delivery rejected at destination (documentation hold).";
    } else if (x < 0.037) {
      d.status = "Damaged";
      d.notes = "Damage reported at discharge inspection.";
    }
  });

  // keep a couple of journeys visibly "In Transit" at the demo clock
  drafts
    .filter((d) => d.status === "Completed" && d.loadingAt!.startsWith(today) && d.loadingAt! >= `${today}T07:00`)
    .slice(-2)
    .forEach((d, i) => {
      d.loadingAt = `${today}T${i === 0 ? "16:50" : "17:12"}`;
      d.dischargeAt = null;
      d.status = "In Transit";
    });

  // ---- finalise: sort chronologically, assign ids and events ----
  drafts.sort((a, b) => (a.loadingAt ?? "").localeCompare(b.loadingAt ?? ""));
  let evSeq = 0;
  const specials: Record<string, string> = {};
  const movements: Movement[] = drafts.map((d, i) => {
    const id = `MV-${String(i + 1).padStart(4, "0")}`;
    const created = d.loadingAt ?? DEMO_NOW;
    const { key: _k, ...rest } = d;
    void _k;
    return {
      ...rest,
      id,
      createdAt: created,
      updatedAt: d.dischargeAt ?? created,
      createdBy: "Historical load",
      pendingApproval: false,
      events: [{ id: `EV-S${String(++evSeq).padStart(5, "0")}`, at: created, by: "Historical load", kind: "created" as const, text: "Record loaded as part of the demo ledger." }],
    };
  });
  for (const [name, d] of Object.entries(sp)) specials[name] = movements[drafts.indexOf(d)].id;
  specials.dup = movements[drafts.indexOf(dup)].id;

  // ---- documents (loading + discharge chits) ----
  const docs: EvidenceDoc[] = [];
  let ds = 0;
  const supervisor = (m: Movement) => (Number((m.loadingAt ?? "").slice(11, 13)) >= 7 && Number((m.loadingAt ?? "").slice(11, 13)) < 19 ? "Ranjith Herath" : "Kumudu Ekanayake");
  for (const m of movements) {
    if (m.status === "Pending") continue;
    const skipLoading = m.id === specials.missingLoading;
    const skipDischarge = m.id === specials.missingDischarge || m.id === specials.missingArrival;
    const sup = supervisor(m);
    if (m.loadingAt && !skipLoading)
      docs.push({
        id: `DOC-${String(++ds).padStart(4, "0")}`,
        name: `LC_${m.id}.jpg`,
        docType: "Loading Chit",
        mime: "image/jpeg",
        sizeKb: 180 + ((ds * 37) % 220),
        uploadedAt: addHoursIso(m.loadingAt, 0.4),
        uploadedBy: sup,
        movementId: m.id,
        history: [{ at: addHoursIso(m.loadingAt, 0.4), by: sup, action: "Uploaded" }],
      });
    if (m.dischargeAt && !skipDischarge)
      docs.push({
        id: `DOC-${String(++ds).padStart(4, "0")}`,
        name: `DC_${m.id}.jpg`,
        docType: "Discharge Chit",
        mime: "image/jpeg",
        sizeKb: 160 + ((ds * 53) % 240),
        uploadedAt: addHoursIso(m.dischargeAt, 0.5),
        uploadedBy: sup,
        movementId: m.id,
        history: [{ at: addHoursIso(m.dischargeAt, 0.5), by: sup, action: "Uploaded" }],
      });
  }
  // a few verified OCR examples + driver log sheets
  const verifiedSample = docs.filter((d) => d.movementId && d.docType === "Loading Chit").slice(-6, -3);
  for (const d of verifiedSample) {
    const m = movements.find((x) => x.id === d.movementId)!;
    d.ocr = {
      extractedAt: addHoursIso(d.uploadedAt, 1),
      verified: true,
      verifiedBy: "Ranjith Herath",
      verifiedAt: addHoursIso(d.uploadedAt, 2),
      fields: [
        { key: "containerNo", label: "Container Number", value: m.containerNos[0], confidence: 96 },
        { key: "truckNo", label: "Truck Number", value: m.primeMoverId ?? "", confidence: 91 },
        { key: "driver", label: "Driver Name", value: m.driverId ?? "", confidence: 84 },
        { key: "terminal", label: "Terminal", value: m.sourceTerminal, confidence: 98 },
        { key: "datetime", label: "Date and Time", value: m.loadingAt ?? "", confidence: 88 },
        { key: "kind", label: "Loading/Discharge", value: "Loading", confidence: 99 },
      ],
    };
    d.history.push({ at: d.ocr.verifiedAt!, by: "Ranjith Herath", action: "OCR extraction verified by human" });
  }
  for (const day of ["2026-11-11", "2026-11-12"]) {
    docs.push({
      id: `DOC-${String(++ds).padStart(4, "0")}`,
      name: `DriverLog_${day}_Morning.jpg`,
      docType: "Driver Log Sheet",
      mime: "image/jpeg",
      sizeKb: 412,
      uploadedAt: `${day}T19:30`,
      uploadedBy: "Ranjith Herath",
      movementId: null,
      history: [{ at: `${day}T19:30`, by: "Ranjith Herath", action: "Uploaded" }],
    });
  }
  return { movements, docs, specials };
}
