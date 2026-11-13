"use client";

import { useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useApp } from "./app-context";
import { can as canDo, canAccess, canSeeFinancials, type ActionKey } from "@/lib/permissions";
import { logAudit, nowOf } from "@/lib/db-helpers";
import type { AppUser, Role } from "@/types/user";

/** Demo "authentication": the role switcher just changes which seeded user is the active session. */
export function useAuth() {
  const { db, update } = useApp();
  const user: AppUser = db.users.find((u) => u.id === db.session.userId) ?? db.users[0];

  const setRole = useCallback(
    (role: Role) => {
      const target = db.users.find((u) => u.role === role && u.status === "Active");
      if (!target) {
        toast.error(`No active demo user with role ${role}`);
        return;
      }
      update((d) => {
        d.session.userId = target.id;
        const u = d.users.find((x) => x.id === target.id);
        if (u) u.lastLogin = nowOf(d);
        logAudit(d, { action: "User Login (simulated)", module: "Auth", description: `Switched demo session to ${target.name} (${role}).` }, target);
      });
      toast.success(`Now viewing as ${role}`, { description: target.name });
    },
    [db.users, update],
  );

  return useMemo(
    () => ({
      user,
      role: user.role,
      driverId: user.driverId,
      isDriver: user.role === "Driver",
      setRole,
      can: (a: ActionKey) => canDo(user.role, a),
      canAccess: (path: string) => canAccess(user.role, path),
      canSeeFinancials: canSeeFinancials(user.role),
    }),
    [user, setRole],
  );
}
