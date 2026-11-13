"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/app-context";
import type { Driver } from "@/types/driver";
import type { DriverInput } from "@/lib/mutations/driver";
import { demoToday } from "@/lib/date-utils";

const phoneRe = /^\+?[0-9][0-9 ()-]{6,19}$/;

export const driverSchema = z.object({
  name: z.string().trim().min(3, "Enter the driver's full name (min 3 characters)").max(80),
  phone: z.string().trim().regex(phoneRe, "Enter a valid phone number, e.g. +94 77 123 4567"),
  licenseNo: z.string().trim().min(5, "Enter the driving licence number").max(20),
  licenseExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select the licence expiry date"),
  status: z.enum(["Active", "On Leave", "Suspended", "Inactive"]),
  shift: z.enum(["Morning", "Night", "Rotating"]),
  joinedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select the joining date"),
  address: z.string().trim().min(5, "Enter the residential address").max(160),
  emergencyContact: z.string().trim().regex(phoneRe, "Enter a valid emergency contact number"),
  primeMoverId: z.string(),
});
export type DriverFormValues = z.infer<typeof driverSchema>;

export const toFormValues = (d?: Driver): DriverFormValues => ({
  name: d?.name ?? "",
  phone: d?.phone ?? "",
  licenseNo: d?.licenseNo ?? "",
  licenseExpiry: d?.licenseExpiry ?? "",
  status: d?.status ?? "Active",
  shift: d?.shift ?? "Morning",
  joinedAt: d?.joinedAt ?? demoToday(),
  address: d?.address ?? "",
  emergencyContact: d?.emergencyContact ?? "",
  primeMoverId: d?.primeMoverId ?? "",
});

export function DriverForm({
  driver,
  formId = "driver-form",
  hideActions,
  submitLabel = "Save driver",
  onSubmit,
  onCancel,
}: {
  driver?: Driver;
  formId?: string;
  hideActions?: boolean;
  submitLabel?: string;
  onSubmit: (input: DriverInput) => void;
  onCancel?: () => void;
}) {
  const { db } = useApp();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DriverFormValues>({ resolver: zodResolver(driverSchema), defaultValues: toFormValues(driver) });

  const pmOptions = db.primeMovers.map((p) => {
    const holder = p.driverId && p.driverId !== driver?.id ? db.drivers.find((x) => x.id === p.driverId) : null;
    return { value: p.id, label: `${p.id} · ${p.regNo}${holder ? ` (currently ${holder.name})` : ""}` };
  });

  const submit = handleSubmit((v) => {
    const dup = db.drivers.find((x) => x.id !== driver?.id && x.licenseNo.replace(/\s/g, "").toLowerCase() === v.licenseNo.replace(/\s/g, "").toLowerCase());
    if (dup) {
      setError("licenseNo", { message: `Licence number already registered to ${dup.name} (${dup.id})` });
      return;
    }
    onSubmit({ ...v, primeMoverId: v.primeMoverId || null });
  });

  return (
    <form id={formId} onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name?.message} className="sm:col-span-2">
          <Input {...register("name")} placeholder="e.g. Nuwan Perera" aria-invalid={!!errors.name} />
        </Field>
        <Field label="Contact number" required error={errors.phone?.message}>
          <Input {...register("phone")} placeholder="+94 77 123 4567" aria-invalid={!!errors.phone} />
        </Field>
        <Field label="Emergency contact" required error={errors.emergencyContact?.message}>
          <Input {...register("emergencyContact")} placeholder="+94 71 123 4567" aria-invalid={!!errors.emergencyContact} />
        </Field>
        <Field label="Licence number" required error={errors.licenseNo?.message}>
          <Input {...register("licenseNo")} placeholder="B 1234567" aria-invalid={!!errors.licenseNo} />
        </Field>
        <Field label="Licence expiry" required error={errors.licenseExpiry?.message}>
          <Input type="date" {...register("licenseExpiry")} aria-invalid={!!errors.licenseExpiry} />
        </Field>
        <Field label="Employment status" required error={errors.status?.message}>
          <Controller control={control} name="status" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Active", "On Leave", "Suspended", "Inactive"]} />} />
        </Field>
        <Field label="Shift" required error={errors.shift?.message} hint="Default shift; the roster holds the actual daily assignment.">
          <Controller control={control} name="shift" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Morning", "Night", "Rotating"]} />} />
        </Field>
        <Field label="Joined on" required error={errors.joinedAt?.message}>
          <Input type="date" {...register("joinedAt")} aria-invalid={!!errors.joinedAt} />
        </Field>
        <Field label="Assigned prime mover" error={errors.primeMoverId?.message} hint="Assigning a prime mover held by another driver unassigns that driver.">
          <Controller control={control} name="primeMoverId" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} placeholder="Not assigned" options={pmOptions} />} />
        </Field>
        <Field label="Address" required error={errors.address?.message} className="sm:col-span-2">
          <Textarea {...register("address")} rows={2} placeholder="Residential address" aria-invalid={!!errors.address} />
        </Field>
      </div>
      {!hideActions && (
        <div className="flex justify-end gap-2 border-t pt-4">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="submit" disabled={isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}
