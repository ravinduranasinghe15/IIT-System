export const ROLES = [
  "Administrator",
  "Operations Manager",
  "Operations Staff",
  "Supervisor",
  "Finance Manager",
  "Driver",
] as const;
export type Role = (typeof ROLES)[number];

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "Active" | "Disabled";
  /** Set for Driver-role users: the driver whose data they may see. */
  driverId?: string;
  lastLogin?: string;
}

export type ModuleName =
  | "Auth"
  | "Movements"
  | "Terminal Imports"
  | "Exceptions"
  | "Evidence"
  | "Drivers"
  | "Roster"
  | "Payments"
  | "Invoicing"
  | "Fleet"
  | "Fuel"
  | "Reports"
  | "Master Data"
  | "Settings";

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  role: Role;
  action: string;
  module: ModuleName;
  at: string;
  description: string;
  entityId?: string;
  /** True for financially material events (pay/invoice approvals, material corrections). */
  financial?: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  at: string;
  level: "info" | "warning" | "critical" | "success";
  href?: string;
  read: boolean;
}
