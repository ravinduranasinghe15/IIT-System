import type { Role } from "@/types/user";

/** FRONTEND DEMO PERMISSIONS ONLY – not production authentication or security. */

export const ROLE_ROUTES: Record<Role, string[]> = {
  // CEO: the super dashboard and the reports section
  CEO: ["/dashboard", "/reports"],
  // Manager (formerly Administrator): runs finance and operations – every module
  Manager: ["/"],
  Supervisor: ["/dashboard", "/movements", "/evidence", "/exceptions", "/drivers", "/driver-logs"],
  Driver: ["/dashboard", "/movements", "/drivers/roster"],
};

export function canAccess(role: Role, pathname: string): boolean {
  if (role === "Manager") return true;
  if (pathname === "/") return true;
  return ROLE_ROUTES[role].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const CEO_ = "CEO" as Role;
const MG = "Manager" as Role;
const SV = "Supervisor" as Role;

export const ACTIONS = {
  "movement.create": [MG],
  "movement.edit": [MG],
  "movement.approve": [MG],
  "import.run": [MG],
  "exception.review": [MG, SV],
  "exception.approve": [MG],
  "evidence.upload": [MG, SV],
  "evidence.verify": [MG, SV],
  "driverlog.upload": [MG, SV],
  "driver.manage": [MG],
  "roster.edit": [MG],
  "roster.attendance": [MG, SV],
  "fleet.manage": [MG],
  "fuel.review": [MG],
  "payments.manage": [MG],
  "payments.approve": [MG],
  "invoice.manage": [MG],
  "invoice.approve": [MG],
  "master.edit": [MG],
  "rates.edit": [MG],
  "settings.manage": [MG],
  "reports.view": [CEO_, MG],
} satisfies Record<string, Role[]>;

export type ActionKey = keyof typeof ACTIONS;

export function can(role: Role, action: ActionKey): boolean {
  return (ACTIONS[action] as Role[]).includes(role);
}

/** Roles that may see financial figures (pay, invoices, rates, billable status). */
export function canSeeFinancials(role: Role): boolean {
  return role !== "Driver";
}

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  CEO: "Super dashboard and the reports section (including financial reports). Read-only.",
  Manager: "Finance and operations: every module, master data, settings, approvals and audit logs.",
  Supervisor: "Chit evidence, driver logs, driver directory and roster, attendance recording and exception review.",
  Driver: "Own movements and own roster only. No financial information.",
};
