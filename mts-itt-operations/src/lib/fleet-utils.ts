import { daysBetween, demoToday } from "./date-utils";

export type ServiceStatus = "OK" | "Due Soon" | "Overdue";

/** Days before nextServiceDate at which a vehicle is flagged "Due Soon". */
export const SERVICE_DUE_SOON_DAYS = 14;

/** Derived (never stored): compares nextServiceDate with the demo "today". */
export function serviceStatusOf(nextServiceDate: string | null | undefined, today = demoToday()): ServiceStatus {
  if (!nextServiceDate) return "OK";
  const left = daysBetween(today, nextServiceDate);
  if (left < 0) return "Overdue";
  if (left <= SERVICE_DUE_SOON_DAYS) return "Due Soon";
  return "OK";
}

export function daysToService(nextServiceDate: string | null | undefined, today = demoToday()): number | null {
  return nextServiceDate ? daysBetween(today, nextServiceDate) : null;
}

/** Highest numeric suffix + 1, formatted – safe for ids whose counters are not tracked in db.counters. */
export function nextSeqId(ids: string[], prefix: string, pad: number): string {
  let max = 0;
  for (const id of ids) {
    const n = Number.parseInt(id.replace(/^\D+/, ""), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(pad, "0")}`;
}
