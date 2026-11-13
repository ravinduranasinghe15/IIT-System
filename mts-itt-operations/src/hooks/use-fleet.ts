"use client";

import { useMemo } from "react";
import { toast } from "sonner";
import { useApp } from "@/contexts/app-context";
import { addServiceRecord, updateServiceRecord, updateVehicleDetails, type ServiceInput, type VehicleEditInput } from "@/lib/mutations/fleet";
import { addManualFuel, importGpsRows, reviewFuel, type GpsImportInput, type ManualFuelInput } from "@/lib/mutations/fuel";
import type { FuelReview } from "@/types/fuel";

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

/** Toast + audit-logged wrappers for fleet and fuel mutators. */
export function useFleetActions() {
  const { update } = useApp();
  return useMemo(
    () => ({
      addService: (input: ServiceInput) => run(() => update((d) => addServiceRecord(d, input)), (r) => ({ title: "Service log added", description: `${r.serviceType} for ${r.vehicleId}` })),
      editService: (id: string, input: ServiceInput) => run(() => update((d) => updateServiceRecord(d, id, input)), () => "Service log updated"),
      editVehicle: (id: string, input: VehicleEditInput) => run(() => update((d) => updateVehicleDetails(d, id, input)), (r) => `${r.id} updated`),
      addFuel: (input: ManualFuelInput) => run(() => update((d) => addManualFuel(d, input)), (r) => ({ title: "Fuel entry added", description: `${r.litres} L for ${r.vehicleId}` })),
      importGps: (input: GpsImportInput) => run(() => update((d) => importGpsRows(d, input)), (r) => ({ title: "GPS import complete", description: `${r.records} records from ${r.fileName}` })),
      review: (vehicleId: string, month: string, status: FuelReview["status"], note: string) =>
        run(() => update((d) => reviewFuel(d, vehicleId, month, status, note)), () => "Review saved"),
    }),
    [update],
  );
}
