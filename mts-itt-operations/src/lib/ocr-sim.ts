import type { DB } from "@/types/db";
import type { EvidenceDoc, OcrField } from "@/types/evidence";
import type { Movement } from "@/types/movement";
import { fnvHex } from "./prng";

/**
 * SIMULATED assisted extraction (deterministic). This is NOT real OCR: no image is analysed.
 * Values are derived from the linked movement (or a plausible movement picked from a hash of the file name),
 * with deliberately lower confidence / small errors on some fields so that human correction is meaningful.
 * Output is always unverified and requires human validation.
 */
export const OCR_DISCLAIMER =
  "Simulated assisted extraction (demonstration only) – this is not real OCR. Values are pre-filled for review and must be checked and verified by a person before they are relied on.";

const hashInt = (s: string, offset = 0) => parseInt(fnvHex(s).slice(offset, offset + 8), 16);

/** Plausible movement for a document that is not linked to one – picked deterministically from the file name. */
export function guessMovementForDoc(doc: Pick<EvidenceDoc, "name" | "docType">, db: DB): Movement | null {
  const pool = db.movements.filter((m) => (doc.docType === "Discharge Chit" ? !!m.dischargeAt : !!m.loadingAt) && m.status !== "Pending");
  if (!pool.length) return null;
  return pool[hashInt(`${doc.name}|${doc.docType}`) % pool.length];
}

function corruptContainer(cn: string, h: number): string {
  // change one digit (never the first four letters) so the ISO check digit usually no longer matches
  const idx = 4 + (h % 7);
  const d = (Number(cn[idx]) + 1 + (h % 8)) % 10;
  return cn.slice(0, idx) + d + cn.slice(idx + 1);
}

function corruptName(name: string, h: number): string {
  if (name.length < 6) return name;
  const idx = 2 + (h % (name.length - 3));
  return name.slice(0, idx) + name.slice(idx + 1);
}

function corruptTruck(truck: string): string {
  return truck.replace(/0(?=\d$|\d\d$)/, "O");
}

function shiftTime(iso: string, h: number): string {
  const mins = 5 + (h % 14);
  const ms = Date.parse(`${iso.slice(0, 16)}:00Z`) + mins * 60000;
  return new Date(ms).toISOString().slice(0, 16);
}

/** Extraction result for a document. `linked` (if any) is the movement the values are read from. */
export function simulateExtraction(doc: EvidenceDoc, db: DB): { fields: OcrField[]; sourceMovement: Movement | null; inferred: boolean } {
  const linked = doc.movementId ? (db.movements.find((m) => m.id === doc.movementId) ?? null) : null;
  const m = linked ?? guessMovementForDoc(doc, db);
  const seed = `${doc.id}|${doc.name}|${doc.docType}`;
  const h = hashInt(seed);
  const isDischarge = doc.docType === "Discharge Chit";
  const isChit = doc.docType === "Loading Chit" || isDischarge;
  const driverName = m?.driverId ? (db.drivers.find((d) => d.id === m.driverId)?.name ?? m.driverId) : "";

  // [key, label, trueValue, baseConfidence]
  type Spec = [string, string, string, number];
  const specs: Spec[] = [];
  if (isChit) {
    specs.push(
      ["containerNo", "Container Number", m?.containerNos.join(" / ") ?? "", 93 + (h % 6)],
      ["truckNo", "Truck Number", m?.primeMoverId ?? "", 88 + ((h >> 3) % 9)],
      ["driver", "Driver Name", driverName, 82 + ((h >> 5) % 12)],
      ["terminal", "Terminal", (isDischarge ? m?.destinationTerminal : m?.sourceTerminal) ?? "", 95 + ((h >> 7) % 5)],
      ["datetime", "Date and Time", (isDischarge ? m?.dischargeAt : m?.loadingAt) ?? "", 84 + ((h >> 9) % 12)],
      ["kind", "Loading/Discharge", isDischarge ? "Discharge" : "Loading", 97 + ((h >> 11) % 3)],
    );
  } else if (doc.docType === "Fuel Invoice") {
    specs.push(
      ["truckNo", "Truck Number", m?.primeMoverId ?? "", 86 + (h % 10)],
      ["driver", "Driver Name", driverName, 78 + ((h >> 3) % 14)],
      ["datetime", "Date and Time", m?.loadingAt ?? "", 82 + ((h >> 5) % 14)],
    );
  } else {
    specs.push(
      ["driver", "Driver Name", driverName, 80 + (h % 14)],
      ["truckNo", "Truck Number", m?.primeMoverId ?? "", 84 + ((h >> 3) % 12)],
      ["datetime", "Date and Time", m?.loadingAt ?? "", 80 + ((h >> 5) % 14)],
    );
  }

  const pickable = specs.map(([k], i) => ({ k, i })).filter(({ k }) => k !== "kind" && k !== "terminal");
  const bad = pickable.length ? pickable[(h >> 13) % pickable.length].i : 0;
  const soft = pickable.length > 1 ? pickable[((h >> 17) + 1) % pickable.length].i : -1;

  const fields: OcrField[] = specs.map(([key, label, truth, base], i) => {
    let value = truth;
    let confidence = Math.min(99, base);
    if (i === bad && truth) {
      confidence = 58 + (h % 15); // 58–72 : low confidence + small error
      if (key === "containerNo") value = truth.split(" / ").map((c, j) => (j === 0 ? corruptContainer(c, h) : c)).join(" / ");
      else if (key === "driver") value = corruptName(truth, h);
      else if (key === "truckNo") value = corruptTruck(truth) === truth ? `${truth.slice(0, -1)}${(Number(truth.slice(-1)) + 1) % 10}` : corruptTruck(truth);
      else if (key === "datetime") value = shiftTime(truth, h);
    } else if (i === soft && truth) {
      confidence = 74 + ((h >> 4) % 8); // 74–81 : correct but below a comfortable confidence
    }
    return { key, label, value, confidence };
  });
  return { fields, sourceMovement: m, inferred: !linked };
}

/** Value held in the ledger for an OCR field key (used to highlight differences during review). */
export function ledgerValueFor(key: string, m: Movement | null | undefined, doc: Pick<EvidenceDoc, "docType">, db: DB): string | null {
  if (!m) return null;
  const isDischarge = doc.docType === "Discharge Chit";
  switch (key) {
    case "containerNo":
      return m.containerNos.join(" / ");
    case "truckNo":
      return m.primeMoverId ?? "";
    case "driver":
      return m.driverId ? (db.drivers.find((d) => d.id === m.driverId)?.name ?? m.driverId) : "";
    case "terminal":
      return isDischarge ? m.destinationTerminal : m.sourceTerminal;
    case "datetime":
      return (isDischarge ? m.dischargeAt : m.loadingAt) ?? "";
    case "kind":
      return isDischarge ? "Discharge" : "Loading";
    default:
      return null;
  }
}

/** Normalised comparison used for highlighting (driver ids from older seed rows are treated as equal to the driver's name). */
export function sameValue(a: string, b: string, key: string, db: DB): boolean {
  const n = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (key === "driver") {
    const asName = (s: string) => db.drivers.find((d) => d.id === s)?.name ?? s;
    return n(asName(a)) === n(asName(b));
  }
  return n(a) === n(b);
}
