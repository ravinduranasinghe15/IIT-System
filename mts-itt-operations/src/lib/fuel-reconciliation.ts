import type { DB } from "@/types/db";
import type { FuelRecord, FuelReview } from "@/types/fuel";
import { monthOf } from "./date-utils";

/**
 * Fuel reconciliation – pure functions. GPS (Track My Car) records and fuel-station records
 * are separate, original records. Fuel-station side = "Fuel Invoice" + "Manual" entries.
 * Nothing here ever changes a source record; reviews live in db.fuelReviews.
 */

export const FUEL_REVIEW_STATUSES: FuelReview["status"][] = ["Pending Review", "Reviewed – Explained", "Reviewed – Escalated"];

export const fuelReconKey = (vehicleId: string, month: string) => `${vehicleId}|${month}`;

export interface FuelReconRow {
  key: string;
  vehicleId: string;
  /** yyyy-MM */
  month: string;
  gpsLitres: number;
  invoiceLitres: number;
  /** invoice litres - GPS litres (positive = more fuel bought than the GPS reports) */
  difference: number;
  /** difference / GPS litres x 100; null when there is no GPS figure */
  variancePct: number | null;
  flagged: boolean;
  flagReason: string;
  gpsDistanceKm: number;
  /** GPS-reported litres per 100 km, null when no distance */
  gpsLPer100Km: number | null;
  gpsRecords: number;
  invoiceRecords: number;
  review: FuelReview | null;
  /** "Pending Review" is the default for flagged rows with no review; "OK" for unflagged rows with no review */
  reviewStatus: FuelReview["status"] | "OK";
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export const isStationSide = (r: FuelRecord) => r.source === "Fuel Invoice" || r.source === "Manual";

/** Per vehicle & month reconciliation of GPS litres vs fuel-station litres. */
export function reconcileFuel(db: DB, filter: { month?: string; vehicleId?: string } = {}): FuelReconRow[] {
  const threshold = db.settings.fuelVarianceThresholdPct;
  const reviews = new Map(db.fuelReviews.map((r) => [r.key, r]));
  const acc = new Map<string, { vehicleId: string; month: string; gps: number; inv: number; km: number; g: number; i: number }>();
  for (const r of db.fuelRecords) {
    const month = monthOf(r.date);
    if (filter.month && month !== filter.month) continue;
    if (filter.vehicleId && r.vehicleId !== filter.vehicleId) continue;
    const key = fuelReconKey(r.vehicleId, month);
    const a = acc.get(key) ?? { vehicleId: r.vehicleId, month, gps: 0, inv: 0, km: 0, g: 0, i: 0 };
    if (r.source === "GPS") {
      a.gps += r.litres;
      a.km += r.distanceKm ?? 0;
      a.g += 1;
    } else if (isStationSide(r)) {
      a.inv += r.litres;
      a.i += 1;
    }
    acc.set(key, a);
  }
  const rows: FuelReconRow[] = [];
  for (const [key, a] of acc) {
    const difference = round1(a.inv - a.gps);
    const variancePct = a.gps > 0 ? round1(((a.inv - a.gps) / a.gps) * 100) : null;
    let flagged = false;
    let flagReason = "Within threshold";
    if (a.gps === 0 && a.inv === 0) {
      flagReason = "No fuel recorded";
    } else if (a.gps === 0) {
      flagged = true;
      flagReason = "Fuel purchased but no GPS data";
    } else if (a.inv === 0) {
      flagged = true;
      flagReason = "GPS fuel but no fuel-station records";
    } else if (variancePct !== null && Math.abs(variancePct) > threshold) {
      flagged = true;
      flagReason = `${variancePct > 0 ? "Purchased more" : "Purchased less"} than GPS by ${Math.abs(variancePct).toFixed(1)}% (threshold ${threshold}%)`;
    }
    const review = reviews.get(key) ?? null;
    rows.push({
      key,
      vehicleId: a.vehicleId,
      month: a.month,
      gpsLitres: round1(a.gps),
      invoiceLitres: round1(a.inv),
      difference,
      variancePct,
      flagged,
      flagReason,
      gpsDistanceKm: Math.round(a.km),
      gpsLPer100Km: a.km > 0 ? round1((a.gps / a.km) * 100) : null,
      gpsRecords: a.g,
      invoiceRecords: a.i,
      review,
      reviewStatus: review ? review.status : flagged ? "Pending Review" : "OK",
    });
  }
  return rows.sort((x, y) => y.month.localeCompare(x.month) || x.vehicleId.localeCompare(y.vehicleId));
}

/** Months (yyyy-MM) with any fuel data, newest first. */
export function fuelMonths(db: DB): string[] {
  return [...new Set(db.fuelRecords.map((r) => monthOf(r.date)))].sort().reverse();
}

export function fuelReconSummary(rows: FuelReconRow[]) {
  const flagged = rows.filter((r) => r.flagged);
  return {
    gpsLitres: round1(rows.reduce((s, r) => s + r.gpsLitres, 0)),
    invoiceLitres: round1(rows.reduce((s, r) => s + r.invoiceLitres, 0)),
    flagged: flagged.length,
    pendingReview: flagged.filter((r) => r.reviewStatus === "Pending Review").length,
  };
}
