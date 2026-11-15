export type UnitMode = "per-trailer" | "per-container";

export interface PayLine {
  driverId: string;
  driverName: string;
  movementIds: string[];
  completedMovements: number;
  /** Units according to the configured unit mode */
  payableUnits: number;
  baseAmount: number;
  /** blended rate = baseAmount / payableUnits */
  rate: number;
  adjustments: number;
  adjustmentNote: string;
  total: number;
  excluded: { movementId: string; reason: string }[];
  /** Completed movements held back (e.g. by an exception) that become payable once cleared */
  pendingUnits?: number;
  pendingAmount?: number;
}

export interface PayApprovalEvent {
  at: string;
  by: string;
  action: "Draft generated" | "Auto-updated" | "Draft regenerated" | "Adjustment added" | "Submitted" | "Approved" | "Reopened";
  note: string;
}

export interface PayRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: "Draft" | "Approved";
  unitMode: UnitMode;
  rates: { "20FT": number; "40FT": number };
  currency: string;
  generatedAt: string;
  generatedBy: string;
  approvedAt?: string;
  approvedBy?: string;
  lines: PayLine[];
  history: PayApprovalEvent[];
}
