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
import { ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { saveUser } from "@/lib/mutations/settings";
import { ROLES, type AppUser } from "@/types/user";

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter the user's full name").max(60, "Max 60 characters"),
    email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
    role: z.enum(ROLES),
    status: z.enum(["Active", "Disabled"]),
    driverId: z.string(),
  })
  .refine((v) => v.role !== "Driver" || v.driverId !== "", { path: ["driverId"], message: "Driver users must be linked to a Driver record" });
type Values = z.infer<typeof schema>;

const blank: Values = { name: "", email: "", role: "Operations Staff", status: "Active", driverId: "" };

export function UserFormDialog({ open, user, onClose }: { open: boolean; user: AppUser | null; onClose: () => void }) {
  const { db, update } = useApp();
  const { register, control, handleSubmit, reset, setError, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: blank });
  const { errors } = formState;
  const role = useWatch({ control, name: "role" });

  useEffect(() => {
    if (!open) return;
    reset(user ? { name: user.name, email: user.email, role: user.role, status: user.status, driverId: user.driverId ?? "" } : blank);
  }, [open, user, reset]);

  const onSubmit = handleSubmit((v) => {
    const res = update((d) => saveUser(d, { name: v.name, email: v.email, role: v.role, status: v.status, driverId: v.driverId || undefined }, user?.id));
    if (!res.ok) {
      setError(res.error.toLowerCase().includes("email") ? "email" : "role", { message: res.error });
      return void toast.error(res.error);
    }
    toast.success(user ? `User ${v.name} updated` : `User ${v.name} created`);
    onClose();
  });

  const driverOptions = db.drivers.map((d) => {
    const linked = db.users.find((u) => u.driverId === d.id && u.id !== user?.id);
    return { value: d.id, label: `${d.id} – ${d.name}${linked ? ` (linked: ${linked.name})` : ""}` };
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={user ? `Edit user ${user.id}` : "Create demo user"}
      description="Demo accounts only – there is no password or real authentication. The role switcher uses these users."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>{user ? "Save changes" : "Create user"}</Button>
        </>
      }
    >
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name?.message}>
          <Input {...register("name")} aria-invalid={!!errors.name} />
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          <Input type="email" {...register("email")} aria-invalid={!!errors.email} />
        </Field>
        <Field label="Role" required error={errors.role?.message}>
          <Controller control={control} name="role" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={[...ROLES]} />} />
        </Field>
        <Field label="Status" required error={errors.status?.message}>
          <Controller control={control} name="status" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Active", "Disabled"]} />} />
        </Field>
        {role === "Driver" && (
          <Field label="Linked driver record" required className="sm:col-span-2" error={errors.driverId?.message} hint="This user will only see this driver's own movements and roster.">
            <Controller control={control} name="driverId" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} placeholder="Select a driver…" options={driverOptions} />} />
          </Field>
        )}
        <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate sm:col-span-2">
          <strong className="text-ink">{role}:</strong> {ROLE_DESCRIPTIONS[role]}
        </p>
        <button type="submit" className="hidden" />
      </form>
    </FormDialog>
  );
}
