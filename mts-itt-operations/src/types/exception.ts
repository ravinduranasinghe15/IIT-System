import type { TerminalCode } from "./terminal";

export const EXCEPTION_TYPES = [
  "Missing Loading Chit",
  "Missing Discharge Chit",
  "Container Number Mismatch",
  "Destination Mismatch",
  "Truck Number Mismatch",
  "Driver Information Missing",
  "Duplicate Movement",
  "Rejected Delivery",
  "Damaged Container",
  "Missing Arrival Time",
] as const;
export type ExceptionType = (typeof EXCEPTION_TYPES)[number];

export type ExceptionStatus = "Open" | "Under Review" | "Resolved" | "Rejected";
export type ExceptionPriority = "Critical" | "High" | "Medium" | "Low";

export interface ExceptionComment {
  id: string;
  by: string;
  at: string;
  text: string;
}

export interface ExceptionConflict {
  field: string;
  systemValue: string;
  sourceValue: string;
}

export interface ExceptionRecord {
  id: string;
  movementId: string;
  containerNo: string;
  type: ExceptionType;
  sourceTerminal: TerminalCode;
  priority: ExceptionPriority;
  reportedAt: string;
  assignedTo: string | null;
  status: ExceptionStatus;
  description: string;
  /** Conflicting values: system record vs terminal report / evidence */
  conflicts: ExceptionConflict[];
  comments: ExceptionComment[];
  importId?: string;
  /** Resolution requires manager approval because it changes financially material data */
  materialCorrection: boolean;
  resolvedBy?: string;
  resolvedAt?: string;
  resolutionNote?: string;
  rejectReason?: string;
  managerApproved?: boolean;
  managerApprovedBy?: string;
  managerApprovedAt?: string;
}
