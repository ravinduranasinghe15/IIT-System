import type { DB } from "@/types/db";
import type { AppUser, AuditLog, AppNotification, ModuleName } from "@/types/user";
import { DEMO_NOW, addHoursIso } from "./date-utils";

/**
 * Demo clock: starts at DEMO_NOW and advances one minute for every persisted change.
 * Deterministic, monotonic, survives refresh, and needs no wall-clock access during render.
 */
export function nowOf(db: DB): string {
  return addHoursIso(DEMO_NOW, (db.counters.tick ?? 0) / 60);
}

export function nextId(db: DB, key: string, prefix: string, pad = 4): string {
  const n = (db.counters[key] ?? 0) + 1;
  db.counters[key] = n;
  return `${prefix}${String(n).padStart(pad, "0")}`;
}

export function actorOf(db: DB): AppUser {
  return db.users.find((u) => u.id === db.session.userId) ?? db.users[0];
}

export interface AuditInput {
  action: string;
  module: ModuleName;
  description: string;
  entityId?: string;
  financial?: boolean;
}

export function logAudit(db: DB, input: AuditInput, actor: AppUser = actorOf(db)): AuditLog {
  const entry: AuditLog = {
    id: nextId(db, "audit", "AL-", 5),
    userId: actor.id,
    userName: actor.name,
    role: actor.role,
    at: nowOf(db),
    ...input,
  };
  db.audit.unshift(entry);
  return entry;
}

export function notify(
  db: DB,
  n: Omit<AppNotification, "id" | "at" | "read">,
): void {
  db.notifications.unshift({ id: nextId(db, "notification", "NT-", 4), at: nowOf(db), read: false, ...n });
  if (db.notifications.length > 60) db.notifications.length = 60;
}
