export type FuelSource = "GPS" | "Fuel Invoice" | "Manual";

/** Original fuel records are append-only: never overwritten, only reviewed. */
export interface FuelRecord {
  id: string;
  vehicleId: string;
  /** yyyy-MM-dd */
  date: string;
  source: FuelSource;
  litres: number;
  amount?: number;
  station?: string;
  invoiceNo?: string;
  odometerKm?: number;
  distanceKm?: number;
  documentId?: string;
  gpsImportId?: string;
  enteredBy: string;
  note?: string;
}

export interface GpsImport {
  id: string;
  fileName: string;
  uploadedAt: string;
  uploadedBy: string;
  provider: string;
  records: number;
  vehicles: number;
  periodFrom: string;
  periodTo: string;
}

export interface FuelReview {
  /** `${vehicleId}|${yyyy-MM}` */
  key: string;
  status: "Pending Review" | "Reviewed – Explained" | "Reviewed – Escalated";
  note: string;
  reviewedBy: string;
  reviewedAt: string;
}
