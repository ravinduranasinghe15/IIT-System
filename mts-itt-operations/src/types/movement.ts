import type { ContainerSize, TerminalCode } from "./terminal";

export const MOVEMENT_STATUSES = [
  "Pending",
  "In Transit",
  "Completed",
  "Rejected",
  "Damaged",
  "Under Review",
] as const;
export type MovementStatus = (typeof MOVEMENT_STATUSES)[number];

/** Derived (never stored) – see lib/eligibility.ts */
export type BillableStatus =
  | "Billable"
  | "Blocked – Exception"
  | "Pending Approval"
  | "Pending Completion"
  | "Non-billable";

export interface MovementEvent {
  id: string;
  at: string;
  by: string;
  kind: "created" | "edited" | "status" | "reconciliation" | "document" | "approval" | "import";
  text: string;
}

export interface Movement {
  id: string;
  /** One or two container numbers (two only when size is 20FT). One movement = one physical truck journey. */
  containerNos: string[];
  containerSize: ContainerSize;
  sourceTerminal: TerminalCode;
  destinationTerminal: TerminalCode;
  primeMoverId: string | null;
  trailerId: string | null;
  driverId: string | null;
  /** Local wall-clock "yyyy-MM-ddTHH:mm" in the configured timezone */
  loadingAt: string | null;
  dischargeAt: string | null;
  status: MovementStatus;
  notes: string;
  origin: "Manual" | "Import" | "Seed";
  importId?: string;
  sourceRowNo?: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  /** A financially material correction awaits manager approval – blocks billable status. */
  pendingApproval: boolean;
  events: MovementEvent[];
}
