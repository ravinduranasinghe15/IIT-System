"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { saveTerminal } from "@/lib/mutations/master";
import type { Terminal } from "@/types/terminal";

const schema = z.object({
  name: z.string().trim().min(3, "Enter the terminal name (min 3 characters)").max(80, "Max 80 characters"),
  role: z.enum(["Source", "Destination", "Source & Destination"]),
  status: z.enum(["Active", "Conditional", "Inactive"]),
  note: z.string().trim().max(240, "Max 240 characters"),
});
type Values = z.infer<typeof schema>;

export function TerminalFormDialog({ terminal, onClose }: { terminal: Terminal | null; onClose: () => void }) {
  const { update } = useApp();
  const [pending, setPending] = useState<Values | null>(null);
  const { register, control, handleSubmit, reset, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", role: "Source", status: "Active", note: "" },
  });
  const { errors } = formState;

  useEffect(() => {
    if (terminal) reset({ name: terminal.name, role: terminal.role, status: terminal.status, note: terminal.note });
  }, [terminal, reset]);

  const commit = (v: Values) => {
    if (!terminal) return;
    const res = update((d) => saveTerminal(d, terminal.code, v));
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Terminal ${terminal.code} updated`);
    onClose();
  };

  const onSubmit = handleSubmit((v) => {
    if (terminal && terminal.status !== "Inactive" && v.status === "Inactive") setPending(v);
    else commit(v);
  });

  return (
    <>
    <ConfirmDialog
      open={!!pending}
      onOpenChange={(o) => !o && setPending(null)}
      title={`Deactivate terminal ${terminal?.code ?? ""}?`}
      description="An inactive terminal is treated as not operational. Existing movements and routes are preserved."
      confirmLabel="Deactivate"
      destructive
      onConfirm={() => pending && commit(pending)}
    />
    <FormDialog
      open={!!terminal}
      onOpenChange={(o) => !o && onClose()}
      title={`Edit terminal ${terminal?.code ?? ""}`}
      description="Terminal codes are fixed; name, role, status and operational note are editable."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>Save changes</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Terminal code">
          <Input value={terminal?.code ?? ""} disabled readOnly />
        </Field>
        <Field label="Name" required error={errors.name?.message}>
          <Input {...register("name")} aria-invalid={!!errors.name} />
        </Field>
        <Field label="Role" required error={errors.role?.message}>
          <Controller control={control} name="role" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Source", "Destination", "Source & Destination"]} />} />
        </Field>
        <Field label="Status" required error={errors.status?.message} hint="Conditional = pending sample validation / confirmation.">
          <Controller control={control} name="status" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Active", "Conditional", "Inactive"]} />} />
        </Field>
        <Field label="Operational note" className="sm:col-span-2" error={errors.note?.message}>
          <Textarea {...register("note")} rows={3} aria-invalid={!!errors.note} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </FormDialog>
    </>
  );
}
