import type { TerminalCode } from "./terminal";

export const STD_FIELDS = [
  { key: "containerNo", label: "Container Number", required: true },
  { key: "containerSize", label: "Container Size", required: false },
  { key: "sourceTerminal", label: "Source Terminal", required: false },
  { key: "destinationTerminal", label: "Destination Terminal", required: true },
  { key: "truckNo", label: "Truck Number", required: false },
  { key: "trailerNo", label: "Trailer Number", required: false },
  { key: "driver", label: "Driver", required: false },
  { key: "loadingAt", label: "Loading Time", required: false },
  { key: "dischargeAt", label: "Discharge Time", required: false },
  { key: "status", label: "Movement Status", required: false },
] as const;
export type StdFieldKey = (typeof STD_FIELDS)[number]["key"];
export type ColumnMapping = Partial<Record<StdFieldKey, string>>;
export type StdRow = Partial<Record<StdFieldKey, string>>;

export type ImportRowStatus = "Imported" | "Invalid" | "Duplicate";

export interface ImportRowResult {
  rowNo: number;
  status: ImportRowStatus;
  /** Blocking problems (row rejected) */
  errors: string[];
  /** Non-blocking problems (row imported, exception raised) */
  warnings: string[];
  data: StdRow;
  /** Raw source cells, preserved for review */
  raw: Record<string, string>;
  movementId?: string;
  duplicateOf?: string;
}

export interface ImportRecord {
  id: string;
  fileName: string;
  /** SHA-256 (or fallback hash) of the file bytes */
  fingerprint: string;
  terminal: TerminalCode;
  uploadedBy: string;
  uploadedAt: string;
  total: number;
  success: number;
  failed: number;
  duplicate: number;
  status: "Completed" | "Completed with Issues" | "Rejected – Duplicate File";
  exceptionsRaised: number;
  mapping: ColumnMapping;
  rows: ImportRowResult[];
  note?: string;
}
