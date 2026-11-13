import type { DB } from "@/types/db";
import type { FuelRecord, FuelReview, GpsImport } from "@/types/fuel";
import type { EvidenceDoc } from "@/types/evidence";
import { actorOf, logAudit, nextId, notify, nowOf } from "@/lib/db-helpers";
import { fuelReconKey, reconcileFuel } from "@/lib/fuel-reconciliation";
import { formatDate, formatMonth } from "@/lib/date-utils";
import type { GpsRowResult } from "@/lib/gps-import";

/** Fuel records are append-only originals: these mutators only ADD records or store reviews. */

export interface ManualFuelInput {
  vehicleId: string;
  date: string;
  litres: number;
  amount?: number;
  station?: string;
  invoiceNo?: string;
  odometerKm?: number;
  note?: string;
  /** Optional invoice attachment (stored as an EvidenceDoc of type "Fuel Invoice"). */
  attachment?: { name: string; mime: string; sizeKb: number; dataUrl?: string } | null;
}

export function addManualFuel(d: DB, input: ManualFuelInput): FuelRecord {
  const actor = actorOf(d);
  let documentId: string | undefined;
  if (input.attachment) {
    const doc: EvidenceDoc = {
      id: nextId(d, "document", "DOC-", 4),
      name: input.attachment.name,
      docType: "Fuel Invoice",
      mime: input.attachment.mime,
      sizeKb: input.attachment.sizeKb,
      uploadedAt: nowOf(d),
      uploadedBy: actor.name,
      movementId: null,
      dataUrl: input.attachment.dataUrl,
      history: [{ at: nowOf(d), by: actor.name, action: `Uploaded as fuel invoice for ${input.vehicleId}` }],
    };
    d.documents.unshift(doc);
    documentId = doc.id;
  }
  const rec: FuelRecord = {
    id: nextId(d, "fuel", "FR-", 4),
    vehicleId: input.vehicleId,
    date: input.date,
    source: "Manual",
    litres: input.litres,
    amount: input.amount,
    station: input.station?.trim() || undefined,
    invoiceNo: input.invoiceNo?.trim() || undefined,
    odometerKm: input.odometerKm,
    documentId,
    enteredBy: actor.name,
    note: input.note?.trim() || undefined,
  };
  d.fuelRecords.push(rec);
  logAudit(d, {
    action: "Fuel Entry Added",
    module: "Fuel",
    entityId: rec.id,
    description: `Manual fuel entry ${rec.id}: ${rec.litres} L for ${rec.vehicleId} on ${formatDate(rec.date)}${rec.station ? ` at ${rec.station}` : ""}${documentId ? `; invoice attached as ${documentId}` : ""}.`,
  });
  return rec;
}

export interface GpsImportInput {
  fileName: string;
  provider?: string;
  rows: GpsRowResult[];
}

/** Creates a GpsImport plus one GPS FuelRecord per row. Existing records are never touched. */
export function importGpsRows(d: DB, input: GpsImportInput): GpsImport {
  const actor = actorOf(d);
  const rows = input.rows.filter((r) => r.vehicleId && r.date && r.litres !== null);
  if (rows.length === 0) throw new Error("There are no valid rows to import.");
  const id = nextId(d, "gps", "GPS-", 4);
  const dates = rows.map((r) => r.date as string).sort();
  const imp: GpsImport = {
    id,
    fileName: input.fileName,
    uploadedAt: nowOf(d),
    uploadedBy: actor.name,
    provider: input.provider ?? "Track My Car",
    records: rows.length,
    vehicles: new Set(rows.map((r) => r.vehicleId)).size,
    periodFrom: dates[0],
    periodTo: dates[dates.length - 1],
  };
  d.gpsImports.unshift(imp);
  for (const r of rows) {
    const bits = [r.idleMin !== null ? `Idle ${r.idleMin} min` : null, r.stops !== null ? `${r.stops} stops` : null].filter(Boolean);
    d.fuelRecords.push({
      id: nextId(d, "fuel", "FR-", 4),
      vehicleId: r.vehicleId as string,
      date: r.date as string,
      source: "GPS",
      litres: r.litres as number,
      distanceKm: r.distanceKm ?? undefined,
      gpsImportId: id,
      enteredBy: "Track My Car import",
      note: bits.length ? bits.join(" · ") : undefined,
    });
  }
  logAudit(d, {
    action: "GPS Fuel Import",
    module: "Fuel",
    entityId: id,
    description: `Imported ${imp.records} GPS fuel records for ${imp.vehicles} vehicle(s) from ${imp.fileName} (${formatDate(imp.periodFrom)} to ${formatDate(imp.periodTo)}). Existing records preserved.`,
  });
  const flagged = reconcileFuel(d).filter((r) => r.flagged && r.reviewStatus === "Pending Review" && r.month >= imp.periodFrom.slice(0, 7) && r.month <= imp.periodTo.slice(0, 7));
  if (flagged.length) {
    notify(d, { title: "Fuel variance flagged", body: `${flagged.length} vehicle-month(s) exceed the ${d.settings.fuelVarianceThresholdPct}% variance threshold after the GPS import.`, level: "warning", href: "/fleet/fuel" });
  }
  return imp;
}

export function reviewFuel(d: DB, vehicleId: string, month: string, status: FuelReview["status"], note: string): FuelReview {
  const key = fuelReconKey(vehicleId, month);
  const review: FuelReview = { key, status, note: note.trim(), reviewedBy: actorOf(d).name, reviewedAt: nowOf(d) };
  const idx = d.fuelReviews.findIndex((r) => r.key === key);
  if (idx >= 0) d.fuelReviews[idx] = review;
  else d.fuelReviews.push(review);
  logAudit(d, {
    action: "Fuel Variance Reviewed",
    module: "Fuel",
    entityId: vehicleId,
    description: `${vehicleId} ${formatMonth(month)} fuel reconciliation marked "${status}".${review.note ? ` Note: ${review.note}` : ""} Original GPS and invoice records unchanged.`,
  });
  return review;
}
