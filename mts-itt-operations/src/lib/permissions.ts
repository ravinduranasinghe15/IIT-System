import type { Role } from "@/types/user";

/** FRONTEND DEMO PERMISSIONS ONLY – not production authentication or security. */

export const ROLE_ROUTES: Record<Role, string[]> = {
  Administrator: ["/"],
  "Operations Manager": ["/dashboard", "/movements", "/terminal-imports", "/exceptions", "/evidence", "/drivers", "/fleet", "/reports", "/master-data"],
  "Operations Staff": ["/dashboard", "/movements", "/terminal-imports", "/evidence"],
  Supervisor: ["/dashboard", "/movements", "/evidence", "/exceptions", "/drivers/roster"],
  "Finance Manager": ["/dashboard", "/payments", "/invoicing", "/reports", "/master-data/rates", "/master-data"],
  Driver: ["/dashboard", "/movements", "/drivers/roster"],
};

export function canAccess(role: Role, pathname: string): boolean {
  if (role === "Administrator") return true;
  if (pathname === "/") return true;
  return ROLE_ROUTES[role].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

const A = "Administrator" as Role;
const OM = "Operations Manager" as Role;
const OS = "Operations Staff" as Role;
const SV = "Supervisor" as Role;
const FM = "Finance Manager" as Role;

export const ACTIONS = {
  "movement.create": [A, OM, OS],
  "movement.edit": [A, OM],
  "movement.approve": [A, OM],
  "import.run": [A, OM, OS],
  "exception.review": [A, OM, SV],
  "exception.approve": [A, OM],
  "evidence.upload": [A, OM, OS, SV],
  "evidence.verify": [A, OM, SV],
  "driver.manage": [A, OM],
  "roster.edit": [A, OM],
  "roster.attendance": [A, OM, SV],
  "fleet.manage": [A, OM],
  "fuel.review": [A, OM, FM],
  "payments.manage": [A, FM],
  "payments.approve": [A], // Finance Managers submit pay runs; Administrators approve them
  "invoice.manage": [A, FM],
  "invoice.approve": [A, FM],
  "master.edit": [A, OM],
  "rates.edit": [A, FM],
  "settings.manage": [A],
  "reports.view": [A, OM, FM],
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
  Administrator: "Full access to every module, master data, settings and audit logs.",
  "Operations Manager": "Movements, terminal imports, exceptions (incl. approvals), drivers, roster, fleet and operational reports.",
  "Operations Staff": "Movement registration, terminal imports and document uploads.",
  Supervisor: "Chit evidence, attendance recording and exception review.",
  "Finance Manager": "Driver payments, invoices, rate master and financial reports.",
  Driver: "Own movements and own roster only. No financial information.",
};
