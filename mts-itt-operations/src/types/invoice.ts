import type { ContainerSize, TerminalCode } from "./terminal";
import type { UnitMode } from "./payment";

export interface RateRecord {
  id: string;
  source: TerminalCode;
  destination: TerminalCode;
  containerSize: ContainerSize;
  baseRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  /** Contractual diesel adjustment, % applied on base amount (configurable, finance sign-off pending) */
  dieselAdjustmentPct: number;
  status: "Active" | "Inactive" | "Draft";
}

export interface InvoiceLine {
  movementId: string;
  containerNos: string[];
  containerSize: ContainerSize;
  route: string;
  movementDate: string;
  units: number;
  rateId: string;
  rate: number;
  baseAmount: number;
  dieselPct: number;
  dieselAmount: number;
}

export type InvoiceStatus = "Draft" | "Pending Approval" | "Approved" | "Exported";

export interface InvoiceEvent {
  at: string;
  by: string;
  action: string;
  note: string;
}

export interface Invoice {
  id: string;
  invoiceNo: string;
  terminal: TerminalCode;
  /** yyyy-MM */
  month: string;
  routeFilter: string | null;
  sizeFilter: ContainerSize | null;
  unitMode: UnitMode;
  currency: string;
  status: InvoiceStatus;
  lines: InvoiceLine[];
  /** Overall diesel override (%) – null means per-rate-card values were used */
  dieselOverridePct: number | null;
  baseAmount: number;
  dieselAmount: number;
  finalAmount: number;
  excluded: { movementId: string; reason: string }[];
  createdAt: string;
  createdBy: string;
  history: InvoiceEvent[];
}
