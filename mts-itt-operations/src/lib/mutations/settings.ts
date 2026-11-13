import type { DB, Settings } from "@/types/db";
import type { AppUser } from "@/types/user";
import { logAudit } from "../db-helpers";
import type { MutationResult } from "./master";

const fail = (error: string): MutationResult => ({ ok: false, error });

export type SettingsInput = Omit<Settings, "importMappings">;

const LABELS: Record<keyof SettingsInput, string> = {
  timezone: "timezone",
  opDayStartHour: "operational day start hour",
  currency: "currency",
  billingUnitMode: "billing unit mode",
  payUnitMode: "pay unit mode",
  payRates: "pay rates",
  billRejected: "bill rejected",
  billDamaged: "bill damaged",
  payRejected: "pay rejected",
  payDamaged: "pay damaged",
  requireManagerApproval: "manager approval requirement",
  driversPerTruck: "drivers per truck",
  fuelVarianceThresholdPct: "fuel variance threshold %",
  ocrConfidenceThreshold: "OCR confidence threshold",
};

/** Financially relevant settings are flagged in the audit log. */
const FINANCIAL: (keyof SettingsInput)[] = ["currency", "billingUnitMode", "payUnitMode", "payRates", "billRejected", "billDamaged", "payRejected", "payDamaged"];

export function saveSettings(db: DB, input: SettingsInput): MutationResult {
  const changes: string[] = [];
  let financial = false;
  (Object.keys(LABELS) as (keyof SettingsInput)[]).forEach((k) => {
    const a = JSON.stringify(db.settings[k]);
    const b = JSON.stringify(input[k]);
    if (a !== b) {
      changes.push(`${LABELS[k]}: ${a} → ${b}`);
      if (FINANCIAL.includes(k)) financial = true;
    }
  });
  if (!changes.length) return { ok: true };
  Object.assign(db.settings, input);
  logAudit(db, {
    action: "Settings Updated",
    module: "Settings",
    description: `Business-rule settings changed (${changes.join("; ")}).`,
    financial,
  });
  return { ok: true };
}

export type UserInput = Pick<AppUser, "name" | "email" | "role" | "status"> & { driverId?: string };

export function saveUser(db: DB, input: UserInput, editingId?: string): MutationResult {
  const email = input.email.trim().toLowerCase();
  if (db.users.some((u) => u.id !== editingId && u.email.toLowerCase() === email)) return fail(`Email ${email} is already used by another demo user.`);
  if (input.role === "Driver") {
    if (!input.driverId) return fail("Select the Driver record this user is linked to.");
    if (!db.drivers.some((d) => d.id === input.driverId)) return fail("Linked driver record not found.");
  }
  const driverId = input.role === "Driver" ? input.driverId : undefined;

  if (editingId) {
    const u = db.users.find((x) => x.id === editingId);
    if (!u) return fail("User not found.");
    if ((input.status === "Disabled" || input.role !== "Administrator") && u.role === "Administrator" && u.status === "Active") {
      const others = db.users.filter((x) => x.id !== u.id && x.role === "Administrator" && x.status === "Active").length;
      if (!others) return fail("At least one active Administrator must remain.");
    }
    if (u.id === db.session.userId && input.status === "Disabled") return fail("You cannot disable the user you are currently signed in as.");
    const before = `${u.name} / ${u.role} / ${u.status}`;
    Object.assign(u, { name: input.name.trim(), email, role: input.role, status: input.status, driverId });
    if (!driverId) delete u.driverId;
    logAudit(db, { action: "User Updated", module: "Settings", entityId: u.id, description: `User ${u.id} updated (${before} → ${u.name} / ${u.role} / ${u.status}).` });
    return { ok: true, id: u.id };
  }

  const id = `U-${String((db.users.reduce((m, u) => Math.max(m, Number(u.id.replace(/\D/g, "")) || 0), 0)) + 1).padStart(3, "0")}`;
  const user: AppUser = { id, name: input.name.trim(), email, role: input.role, status: input.status, ...(driverId ? { driverId } : {}) };
  db.users.push(user);
  logAudit(db, { action: "User Created", module: "Settings", entityId: id, description: `Demo user ${id} (${user.name}) created with role ${user.role}.` });
  return { ok: true, id };
}

export function setUserStatus(db: DB, id: string, status: AppUser["status"]): MutationResult {
  const u = db.users.find((x) => x.id === id);
  if (!u) return fail("User not found.");
  if (status === "Disabled") {
    if (u.id === db.session.userId) return fail("You cannot disable the user you are currently signed in as.");
    if (u.role === "Administrator" && !db.users.some((x) => x.id !== u.id && x.role === "Administrator" && x.status === "Active")) return fail("At least one active Administrator must remain.");
  }
  u.status = status;
  logAudit(db, { action: status === "Disabled" ? "User Disabled" : "User Enabled", module: "Settings", entityId: id, description: `User ${u.name} (${u.role}) ${status === "Disabled" ? "disabled" : "enabled"}.` });
  return { ok: true, id };
}
