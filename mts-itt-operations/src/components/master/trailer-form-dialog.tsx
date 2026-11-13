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
import { nextVehicleId, saveTrailer } from "@/lib/mutations/master";
import type { Trailer } from "@/types/vehicle";

const schema = z.object({
  id: z.string().trim().regex(/^[A-Za-z]{2,4}-\d{3,4}$/, "Use the format TR-015"),
  regNo: z.string().trim().min(4, "Registration number is required").max(20, "Max 20 characters"),
  trailerType: z.string().trim().min(2, "Trailer type is required").max(50, "Max 50 characters"),
  capacity: z.string().trim().min(2, "Capacity is required").max(40, "Max 40 characters"),
  status: z.enum(["Active", "In Maintenance", "Inactive"]),
  primeMoverId: z.string(),
});
type Values = z.infer<typeof schema>;

const blank = (id: string): Values => ({ id, regNo: "", trailerType: "40ft Skeletal", capacity: "1 x 40FT or 2 x 20FT", status: "Active", primeMoverId: "" });

export function TrailerFormDialog({ open, trailer, onClose }: { open: boolean; trailer: Trailer | null; onClose: () => void }) {
  const { db, update } = useApp();
  const { register, control, handleSubmit, reset, setError, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: blank("TR-015") });
  const { errors } = formState;
  const pmId = useWatch({ control, name: "primeMoverId" });

  useEffect(() => {
    if (!open) return;
    reset(trailer ? { id: trailer.id, regNo: trailer.regNo, trailerType: trailer.trailerType, capacity: trailer.capacity, status: trailer.status, primeMoverId: trailer.primeMoverId ?? "" } : blank(nextVehicleId(db.trailers, "TR-")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, trailer, reset]);

  const onSubmit = handleSubmit((v) => {
    const { id, primeMoverId, ...rest } = v;
    const res = update((d) => saveTrailer(d, { ...rest, primeMoverId: primeMoverId || null }, id.toUpperCase(), !trailer));
    if (!res.ok) {
      setError(res.error.includes("ID") ? "id" : "regNo", { message: res.error });
      return void toast.error(res.error);
    }
    toast.success(trailer ? `Trailer ${id} updated` : `Trailer ${id} added`);
    onClose();
  });

  const taken = db.primeMovers.find((p) => p.id === pmId && p.trailerId && p.trailerId !== trailer?.id);
  const options = db.primeMovers.map((p) => ({ value: p.id, label: `${p.id} – ${p.regNo}${p.trailerId && p.trailerId !== trailer?.id ? ` (has ${p.trailerId})` : ""}` }));

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={trailer ? `Edit trailer ${trailer.id}` : "Add trailer"}
      description="Assigning a prime mover updates that prime mover's trailer link."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>{trailer ? "Save changes" : "Add trailer"}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Trailer ID" required error={errors.id?.message}>
          <Input {...register("id")} disabled={!!trailer} aria-invalid={!!errors.id} />
        </Field>
        <Field label="Registration no." required error={errors.regNo?.message}>
          <Input {...register("regNo")} aria-invalid={!!errors.regNo} />
        </Field>
        <Field label="Trailer type" required error={errors.trailerType?.message}>
          <Input {...register("trailerType")} aria-invalid={!!errors.trailerType} />
        </Field>
        <Field label="Capacity" required error={errors.capacity?.message}>
          <Input {...register("capacity")} aria-invalid={!!errors.capacity} />
        </Field>
        <Field label="Status" required error={errors.status?.message}>
          <Controller control={control} name="status" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Active", "In Maintenance", "Inactive"]} />} />
        </Field>
        <Field label="Assigned prime mover" error={errors.primeMoverId?.message} hint={taken ? `${taken.id} will switch from ${taken.trailerId} to this trailer.` : undefined}>
          <Controller control={control} name="primeMoverId" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} placeholder="Unassigned" options={options} />} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </FormDialog>
  );
}
