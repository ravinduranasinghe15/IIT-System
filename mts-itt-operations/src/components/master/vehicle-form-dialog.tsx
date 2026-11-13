"use client";

import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { nextVehicleId, savePrimeMover } from "@/lib/mutations/master";
import type { PrimeMover } from "@/types/vehicle";

const schema = z.object({
  id: z.string().trim().regex(/^[A-Za-z]{2,4}-\d{3,4}$/, "Use the format PM-010"),
  regNo: z.string().trim().min(4, "Registration number is required").max(20, "Max 20 characters"),
  vehicleType: z.string().trim().min(2, "Vehicle type is required").max(40, "Max 40 characters"),
  make: z.string().trim().min(2, "Make is required").max(30, "Max 30 characters"),
  model: z.string().trim().min(1, "Model is required").max(30, "Max 30 characters"),
  year: z.number({ error: "Enter a year" }).int("Whole number").min(1990, "Year must be 1990 or later").max(2027, "Year cannot be in the far future"),
  odometerKm: z.number({ error: "Enter odometer km" }).min(0, "Cannot be negative").max(3000000, "Unrealistic odometer value"),
  status: z.enum(["Active", "In Maintenance", "Inactive"]),
  nextServiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select the next service date"),
  trailerId: z.string(),
  driverId: z.string(),
});
type Values = z.infer<typeof schema>;

export function VehicleFormDialog({ open, vehicle, onClose }: { open: boolean; vehicle: PrimeMover | null; onClose: () => void }) {
  const { db, update } = useApp();
  const { register, control, handleSubmit, reset, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: blank("PM-010"),
  });
  const { errors } = formState;
  const [trailerId, driverId] = useWatch({ control, name: ["trailerId", "driverId"] });
  const editingId = vehicle?.id;

  useEffect(() => {
    if (!open) return;
    reset(
      vehicle
        ? {
            id: vehicle.id,
            regNo: vehicle.regNo,
            vehicleType: vehicle.vehicleType,
            make: vehicle.make,
            model: vehicle.model,
            year: vehicle.year,
            odometerKm: vehicle.odometerKm,
            status: vehicle.status,
            nextServiceDate: vehicle.nextServiceDate,
            trailerId: vehicle.trailerId ?? "",
            driverId: vehicle.driverId ?? "",
          }
        : blank(nextVehicleId(db.primeMovers, "PM-")),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, vehicle, reset]);

  const onSubmit = handleSubmit((v) => {
    const { id, trailerId: tr, driverId: dr, ...rest } = v;
    const res = update((d) => savePrimeMover(d, { ...rest, trailerId: tr || null, driverId: dr || null }, id.toUpperCase(), !vehicle));
    if (!res.ok) {
      setError(res.error.includes("ID") ? "id" : "regNo", { message: res.error });
      return void toast.error(res.error);
    }
    toast.success(vehicle ? `Prime mover ${id} updated` : `Prime mover ${id} added`);
    onClose();
  });

  const trailerOptions = db.trailers.map((t) => ({
    value: t.id,
    label: `${t.id} – ${t.regNo}${t.primeMoverId && t.primeMoverId !== editingId ? ` (on ${t.primeMoverId})` : ""}`,
  }));
  const driverOptions = db.drivers.map((dr) => ({
    value: dr.id,
    label: `${dr.id} – ${dr.name}${dr.primeMoverId && dr.primeMoverId !== editingId ? ` (on ${dr.primeMoverId})` : ""}`,
  }));
  const trailerTaken = db.primeMovers.find((p) => p.id !== editingId && p.trailerId === trailerId);
  const driverTaken = db.primeMovers.find((p) => p.id !== editingId && p.driverId === driverId);

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      title={vehicle ? `Edit prime mover ${vehicle.id}` : "Add prime mover"}
      description="Assigned trailer and driver are kept in sync with the Trailer and Driver records. Fleet size and driver allocation are unconfirmed and fully configurable."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>{vehicle ? "Save changes" : "Add prime mover"}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-3">
        <Field label="Vehicle ID" required error={errors.id?.message}>
          <Input {...register("id")} disabled={!!vehicle} aria-invalid={!!errors.id} />
        </Field>
        <Field label="Registration no." required error={errors.regNo?.message}>
          <Input {...register("regNo")} aria-invalid={!!errors.regNo} />
        </Field>
        <Field label="Vehicle type" required error={errors.vehicleType?.message}>
          <Input {...register("vehicleType")} aria-invalid={!!errors.vehicleType} />
        </Field>
        <Field label="Make" required error={errors.make?.message}>
          <Input {...register("make")} aria-invalid={!!errors.make} />
        </Field>
        <Field label="Model" required error={errors.model?.message}>
          <Input {...register("model")} aria-invalid={!!errors.model} />
        </Field>
        <Field label="Year" required error={errors.year?.message}>
          <Input type="number" {...register("year", { valueAsNumber: true })} aria-invalid={!!errors.year} />
        </Field>
        <Field label="Odometer (km)" required error={errors.odometerKm?.message}>
          <Input type="number" {...register("odometerKm", { valueAsNumber: true })} aria-invalid={!!errors.odometerKm} />
        </Field>
        <Field label="Next service date" required error={errors.nextServiceDate?.message}>
          <Input type="date" {...register("nextServiceDate")} aria-invalid={!!errors.nextServiceDate} />
        </Field>
        <Field label="Status" required error={errors.status?.message}>
          <Controller control={control} name="status" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Active", "In Maintenance", "Inactive"]} />} />
        </Field>
        <Field label="Assigned trailer" error={errors.trailerId?.message} hint={trailerTaken ? `Will be moved from ${trailerTaken.id}.` : undefined}>
          <Controller control={control} name="trailerId" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} placeholder="Unassigned" options={trailerOptions} />} />
        </Field>
        <Field label="Assigned driver" error={errors.driverId?.message} hint={driverTaken ? `Will be moved from ${driverTaken.id}.` : undefined}>
          <Controller control={control} name="driverId" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} placeholder="Unassigned" options={driverOptions} />} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </FormDialog>
  );
}

function blank(id: string): Values {
  return { id, regNo: "", vehicleType: "Prime Mover 6x4", make: "", model: "", year: 2023, odometerKm: 0, status: "Active", nextServiceDate: "2027-01-15", trailerId: "", driverId: "" };
}
