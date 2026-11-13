export const DOC_TYPES = [
  "Loading Chit",
  "Discharge Chit",
  "Driver Log Sheet",
  "Fuel Invoice",
  "Other",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export interface OcrField {
  key: string;
  label: string;
  value: string;
  confidence: number;
}

export interface DocHistoryEntry {
  at: string;
  by: string;
  action: string;
}

export interface EvidenceDoc {
  id: string;
  name: string;
  docType: DocType;
  mime: string;
  sizeKb: number;
  uploadedAt: string;
  uploadedBy: string;
  movementId: string | null;
  /** Data URL for user uploads (small files only). Seeded docs render a generated placeholder. */
  dataUrl?: string;
  history: DocHistoryEntry[];
  /** Simulated assisted-extraction result. NOT real OCR – always requires human verification. */
  ocr?: {
    fields: OcrField[];
    extractedAt: string;
    verified: boolean;
    verifiedBy?: string;
    verifiedAt?: string;
  };
}
