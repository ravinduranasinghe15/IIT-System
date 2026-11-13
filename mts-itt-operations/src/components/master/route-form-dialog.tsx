"use client";

import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { deriveRouteCode, saveRoute } from "@/lib/mutations/master";
import { TERMINAL_CODES, type RouteRecord } from "@/types/terminal";

const schema = z
  .object({
    source: z.enum(TERMINAL_CODES, { error: "Select a source terminal" }),
    destination: z.enum(TERMINAL_CODES, { error: "Select a destination terminal" }),
    code: z
      .string()
      .trim()
      .min(3, "Route code is required")
      .max(24, "Max 24 characters")
      .regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and hyphens only"),
    description: z.string().trim().min(3, "Add a short description").max(160, "Max 160 characters"),
    status: z.enum(["Active", "Conditional", "Inactive"]),
  })
  .refine((v) => v.source !== v.destination, { path: ["destination"], message: "Destination must differ from the source" });
type Values = z.infer<typeof schema>;

/** `route` null + `open` = create; a RouteRecord = edit. */
export function RouteFormDialog({ open, route, onClose }: { open: boolean; route: RouteRecord | null; onClose: () => void }) {
  const { db, update } = useApp();
  const { register, control, handleSubmit, reset, setValue, setError, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { source: "CWIT", destination: "JCT", code: "CWIT-JCT", description: "", status: "Active" },
  });
  const { errors } = formState;
  const [source, destination] = useWatch({ control, name: ["source", "destination"] });

  useEffect(() => {
    if (!open) return;
    reset(
      route
        ? { source: route.source, destination: route.destination, code: route.code, description: route.description, status: route.status }
        : { source: "CWIT", destination: "SAGT", code: "CWIT-SAGT", description: "", status: "Active" },
    );
  }, [open, route, reset]);

  const codeDirty = !!formState.dirtyFields.code;
  useEffect(() => {
    if (!route && !codeDirty) setValue("code", deriveRouteCode(source, destination));
  }, [route, codeDirty, source, destination, setValue]);

  const onSubmit = handleSubmit((v) => {
    const res = update((d) => saveRoute(d, v, route?.id));
    if (!res.ok) {
      setError("destination", { message: res.error });
      return void toast.error(res.error);
    }
    toast.success(route ? `Route ${v.code} updated` : `Route ${v.code} created`);
    onClose();
  });

  const terminals = db.terminals.map((t) => ({ value: t.code, label: `${t.code} – ${t.name}` }));

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={route ? `Edit route ${route.id}` : "Add route"}
      description="One route per source-destination pair. The code is derived from the terminals but can be overridden."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>{route ? "Save changes" : "Create route"}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Source terminal" required error={errors.source?.message}>
          <Controller control={control} name="source" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={terminals} />} />
        </Field>
        <Field label="Destination terminal" required error={errors.destination?.message}>
          <Controller control={control} name="destination" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={terminals} />} />
        </Field>
        <Field label="Route code" required error={errors.code?.message} hint="Auto-derived as SOURCE-DESTINATION; editable.">
          <Input {...register("code")} aria-invalid={!!errors.code} />
        </Field>
        <Field label="Status" required error={errors.status?.message}>
          <Controller control={control} name="status" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Active", "Conditional", "Inactive"]} />} />
        </Field>
        <Field label="Description" required className="sm:col-span-2" error={errors.description?.message}>
          <Textarea {...register("description")} rows={2} aria-invalid={!!errors.description} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </FormDialog>
  );
}
