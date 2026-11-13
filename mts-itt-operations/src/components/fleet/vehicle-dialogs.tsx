"use client";

import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/app-context";
import { useFleetActions } from "@/hooks/use-fleet";
import { demoToday, addDays } from "@/lib/date-utils";
import type { PrimeMover, ServiceRecord } from "@/types/vehicle";

const dateStr = (msg: string) => z.string().regex(/^\d{4}-\d{2}-\d{2}$/, msg);

const vehicleSchema = z.object({
  status: z.enum(["Active", "In Maintenance", "Inactive"]),
  odometerKm: z.string().regex(/^\d{1,7}$/, "Enter the odometer reading in whole km"),
  nextServiceDate: dateStr("Select the next service date"),
});
type VehicleValues = z.infer<typeof vehicleSchema>;

export function VehicleEditDialog({ vehicle, open, onOpenChange }: { vehicle: PrimeMover; open: boolean; onOpenChange: (o: boolean) => void }) {
  const actions = useFleetActions();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<VehicleValues>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: { status: vehicle.status, odometerKm: String(vehicle.odometerKm), nextServiceDate: vehicle.nextServiceDate },
  });
  const submit = handleSubmit((v) => {
    if (actions.editVehicle(vehicle.id, { status: v.status, odometerKm: Number(v.odometerKm), nextServiceDate: v.nextServiceDate })) onOpenChange(false);
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Edit ${vehicle.id} – ${vehicle.regNo}`}
      description="Operational details. Registration, make and trailer are managed in Master Data."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="vehicle-edit-form">
            Save changes
          </Button>
        </>
      }
    >
      <form id="vehicle-edit-form" onSubmit={submit} noValidate className="space-y-4">
        <Field label="Status" required error={errors.status?.message}>
          <Controller control={control} name="status" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Active", "In Maintenance", "Inactive"]} />} />
        </Field>
        <Field label="Odometer (km)" required error={errors.odometerKm?.message}>
          <Input inputMode="numeric" {...register("odometerKm")} />
        </Field>
        <Field label="Next service date" required error={errors.nextServiceDate?.message} hint="Drives the derived service status (OK / Due Soon / Overdue).">
          <Input type="date" {...register("nextServiceDate")} />
        </Field>
      </form>
    </FormDialog>
  );
}

const SERVICE_TYPES = ["Full Service", "A-Service", "Brake & Tyre Service", "Transmission Repair", "Engine Repair", "Electrical", "Tyre Replacement", "Inspection", "Other"];

const serviceSchema = z.object({
  vehicleId: z.string().min(1, "Select a vehicle"),
  date: dateStr("Select the service date"),
  serviceType: z.string().trim().min(2, "Select or enter a service type"),
  description: z.string().trim().min(3, "Describe the work done or planned").max(300),
  cost: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a cost, e.g. 780.00 (0 if not yet known)"),
  nextServiceDate: dateStr("Select the next service date"),
  status: z.enum(["Completed", "Scheduled", "Overdue"]),
});
type ServiceValues = z.infer<typeof serviceSchema>;

/** Add or edit a service log (vehicle fixed when opened from a vehicle, selectable otherwise). */
export function ServiceLogDialog({ vehicleId, record, open, onOpenChange }: { vehicleId?: string; record?: ServiceRecord; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { db } = useApp();
  const actions = useFleetActions();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ServiceValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      vehicleId: record?.vehicleId ?? vehicleId ?? "",
      date: record?.date ?? demoToday(),
      serviceType: record?.serviceType ?? "Full Service",
      description: record?.description ?? "",
      cost: record ? String(record.cost) : "",
      nextServiceDate: record?.nextServiceDate ?? addDays(demoToday(), 90),
      status: record?.status ?? "Completed",
    },
  });
  const type = useWatch({ control, name: "serviceType" });
  const typeOptions = SERVICE_TYPES.includes(type) ? SERVICE_TYPES : [type, ...SERVICE_TYPES];

  const submit = handleSubmit((v) => {
    const input = { ...v, cost: Number(v.cost) };
    const ok = record ? actions.editService(record.id, input) : actions.addService(input);
    if (ok) onOpenChange(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={record ? `Edit service log ${record.id}` : "Add service log"}
      description="A Completed service moves the vehicle's next service date forward."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="service-log-form">
            {record ? "Save changes" : "Add service log"}
          </Button>
        </>
      }
    >
      <form id="service-log-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Vehicle" required error={errors.vehicleId?.message}>
          <Controller
            control={control}
            name="vehicleId"
            render={({ field }) => (
              <NativeSelect value={field.value} onValueChange={field.onChange} disabled={!!record || !!vehicleId} placeholder="Select vehicle" options={db.primeMovers.map((p) => ({ value: p.id, label: `${p.id} · ${p.regNo}` }))} />
            )}
          />
        </Field>
        <Field label="Service date" required error={errors.date?.message}>
          <Input type="date" {...register("date")} />
        </Field>
        <Field label="Service type" required error={errors.serviceType?.message}>
          <Controller control={control} name="serviceType" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={typeOptions} />} />
        </Field>
        <Field label="Status" required error={errors.status?.message}>
          <Controller control={control} name="status" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Completed", "Scheduled", "Overdue"]} />} />
        </Field>
        <Field label="Cost" required error={errors.cost?.message} hint={`In ${db.settings.currency}`}>
          <Input inputMode="decimal" {...register("cost")} placeholder="0.00" />
        </Field>
        <Field label="Next service date" required error={errors.nextServiceDate?.message}>
          <Input type="date" {...register("nextServiceDate")} />
        </Field>
        <Field label="Description" required error={errors.description?.message} className="sm:col-span-2">
          <Textarea rows={3} {...register("description")} placeholder="Work carried out / planned" />
        </Field>
      </form>
    </FormDialog>
  );
}
