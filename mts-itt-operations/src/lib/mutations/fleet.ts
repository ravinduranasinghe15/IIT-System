import type { DB } from "@/types/db";
import type { PrimeMover, ServiceRecord } from "@/types/vehicle";
import { logAudit } from "@/lib/db-helpers";
import { formatDate } from "@/lib/date-utils";
import { nextSeqId } from "@/lib/fleet-utils";

export interface ServiceInput {
  vehicleId: string;
  date: string;
  serviceType: string;
  description: string;
  cost: number;
  nextServiceDate: string;
  status: ServiceRecord["status"];
}

function vehicle(d: DB, id: string): PrimeMover {
  const v = d.primeMovers.find((p) => p.id === id);
  if (!v) throw new Error(`Vehicle ${id} not found`);
  return v;
}

/** A Completed service moves the vehicle's next service date forward (this drives the derived service status). */
function syncNextService(d: DB, rec: ServiceRecord) {
  if (rec.status !== "Completed") return;
  const v = vehicle(d, rec.vehicleId);
  if (rec.nextServiceDate) v.nextServiceDate = rec.nextServiceDate;
}

export function addServiceRecord(d: DB, input: ServiceInput): ServiceRecord {
  vehicle(d, input.vehicleId);
  const rec: ServiceRecord = { id: nextSeqId(d.serviceRecords.map((s) => s.id), "SV-", 4), ...input, description: input.description.trim() };
  d.serviceRecords.push(rec);
  syncNextService(d, rec);
  logAudit(d, {
    action: "Service Log Added",
    module: "Fleet",
    entityId: rec.vehicleId,
    description: `${rec.serviceType} logged for ${rec.vehicleId} on ${formatDate(rec.date)} (${rec.status}, cost ${rec.cost.toFixed(2)}, next service ${formatDate(rec.nextServiceDate)}).`,
  });
  return rec;
}

export function updateServiceRecord(d: DB, id: string, input: ServiceInput): ServiceRecord {
  const rec = d.serviceRecords.find((s) => s.id === id);
  if (!rec) throw new Error(`Service record ${id} not found`);
  Object.assign(rec, input, { description: input.description.trim() });
  syncNextService(d, rec);
  logAudit(d, {
    action: "Service Log Edited",
    module: "Fleet",
    entityId: rec.vehicleId,
    description: `Service record ${id} for ${rec.vehicleId} updated (${rec.serviceType}, ${rec.status}, next service ${formatDate(rec.nextServiceDate)}).`,
  });
  return rec;
}

export interface VehicleEditInput {
  status: PrimeMover["status"];
  odometerKm: number;
  nextServiceDate: string;
}

export function updateVehicleDetails(d: DB, id: string, input: VehicleEditInput): PrimeMover {
  const v = vehicle(d, id);
  const changes: string[] = [];
  if (v.status !== input.status) changes.push(`status ${v.status} → ${input.status}`);
  if (v.odometerKm !== input.odometerKm) changes.push(`odometer ${v.odometerKm} → ${input.odometerKm} km`);
  if (v.nextServiceDate !== input.nextServiceDate) changes.push(`next service ${v.nextServiceDate} → ${input.nextServiceDate}`);
  Object.assign(v, input);
  logAudit(d, {
    action: "Vehicle Updated",
    module: "Fleet",
    entityId: id,
    description: changes.length ? `${id} (${v.regNo}) updated: ${changes.join("; ")}.` : `${id} saved with no changes.`,
  });
  return v;
}
