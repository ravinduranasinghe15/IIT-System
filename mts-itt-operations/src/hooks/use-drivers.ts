"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { useApp } from "@/contexts/app-context";
import type { AttendanceStatus, DriverStatus } from "@/types/driver";
import {
  assignPrimeMover,
  decideLeave,
  recordAttendance,
  registerDriver,
  requestLeave,
  setDriverStatus,
  updateDriver,
  updateRosterCell,
  type DriverInput,
  type LeaveInput,
  type RosterPatch,
} from "@/lib/mutations/driver";

function run<T>(fn: () => T, success: (r: T) => string | { title: string; description?: string }): T | null {
  try {
    const r = fn();
    const msg = success(r);
    if (typeof msg === "string") toast.success(msg);
    else toast.success(msg.title, { description: msg.description });
    return r;
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "Something went wrong");
    return null;
  }
}

/** Per-driver movement counts (total and completed). */
export function useDriverStats() {
  const { db } = useApp();
  return useMemo(() => {
    const map = new Map<string, { total: number; completed: number }>();
    for (const m of db.movements) {
      if (!m.driverId) continue;
      const s = map.get(m.driverId) ?? { total: 0, completed: 0 };
      s.total += 1;
      if (m.status === "Completed") s.completed += 1;
      map.set(m.driverId, s);
    }
    return map;
  }, [db.movements]);
}

/** Thin wrappers over the driver / roster mutators: each runs inside `update`, audit-logs and toasts. */
export function useDriverActions() {
  const { update } = useApp();
  return useMemo(
    () => ({
      register: (input: DriverInput) => run(() => update((d) => registerDriver(d, input)), (r) => ({ title: "Driver registered", description: `${r.name} (${r.id})` })),
      edit: (id: string, input: DriverInput) => run(() => update((d) => updateDriver(d, id, input)), (r) => `Saved changes to ${r.name}`),
      assignPrimeMover: (driverId: string, pmId: string | null) =>
        run(() => update((d) => assignPrimeMover(d, driverId, pmId)), () => (pmId ? `Assigned ${pmId}` : "Prime mover unassigned")),
      setStatus: (id: string, status: DriverStatus, note?: string) =>
        run(() => update((d) => setDriverStatus(d, id, status, note)), (r) => `${r.name} is now ${status}`),
      updateCell: (driverId: string, date: string, patch: RosterPatch) =>
        run(() => update((d) => updateRosterCell(d, driverId, date, patch)), () => "Roster updated"),
      attendance: (driverId: string, date: string, status: AttendanceStatus) =>
        run(() => update((d) => recordAttendance(d, driverId, date, status)), () => `Marked ${status}`),
      requestLeave: (input: LeaveInput) => run(() => update((d) => requestLeave(d, input)), (r) => ({ title: "Leave request submitted", description: `${r.id} is pending approval` })),
      decideLeave: (id: string, decision: "Approved" | "Rejected") =>
        run(() => update((d) => decideLeave(d, id, decision)), (r) => `Leave ${r.id} ${decision.toLowerCase()}`),
    }),
    [update],
  );
}
