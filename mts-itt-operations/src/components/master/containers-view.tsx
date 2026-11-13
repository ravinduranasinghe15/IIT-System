"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { FormDialog } from "@/components/shared/form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { saveContainerType } from "@/lib/mutations/master";
import type { ContainerType } from "@/types/terminal";
import { MasterShell } from "./master-shell";

const schema = z.object({
  label: z.string().trim().min(3, "Enter a label (min 3 characters)").max(60, "Max 60 characters"),
  teu: z.number({ error: "Enter a number" }).min(1, "TEU must be at least 1").max(4, "TEU cannot exceed 4"),
  maxPerJourney: z.number({ error: "Enter a whole number" }).int("Must be a whole number").min(1, "At least 1").max(2, "A trailer carries at most 2 containers"),
  status: z.enum(["Active", "Inactive"]),
});
type Values = z.infer<typeof schema>;

function ContainerFormDialog({ item, onClose }: { item: ContainerType | null; onClose: () => void }) {
  const { update } = useApp();
  const [pending, setPending] = useState<Values | null>(null);
  const { register, control, handleSubmit, reset, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { label: "", teu: 1, maxPerJourney: 1, status: "Active" },
  });
  const { errors } = formState;

  useEffect(() => {
    if (item) reset({ label: item.label, teu: item.teu, maxPerJourney: item.maxPerJourney, status: item.status });
  }, [item, reset]);

  const commit = (v: Values) => {
    if (!item) return;
    const res = update((d) => saveContainerType(d, item.size, v));
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Container type ${item.size} updated`);
    onClose();
  };

  const onSubmit = handleSubmit((v) => {
    if (item && item.status === "Active" && v.status === "Inactive") setPending(v);
    else commit(v);
  });

  return (
    <>
      <FormDialog
        open={!!item}
        onOpenChange={(o) => !o && onClose()}
        title={`Edit container type ${item?.size ?? ""}`}
        description="Container sizes are fixed (20FT and 40FT). The journey rule is one 40FT or up to two 20FT per trailer."
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
          <Field label="Size">
            <Input value={item?.size ?? ""} disabled readOnly />
          </Field>
          <Field label="Status" required error={errors.status?.message}>
            <Controller control={control} name="status" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Active", "Inactive"]} />} />
          </Field>
          <Field label="Label" required className="sm:col-span-2" error={errors.label?.message}>
            <Input {...register("label")} aria-invalid={!!errors.label} />
          </Field>
          <Field label="TEU" required error={errors.teu?.message}>
            <Input type="number" step="1" {...register("teu", { valueAsNumber: true })} aria-invalid={!!errors.teu} />
          </Field>
          <Field label="Max per journey" required error={errors.maxPerJourney?.message} hint="Containers of this size allowed on one trailer.">
            <Input type="number" step="1" {...register("maxPerJourney", { valueAsNumber: true })} aria-invalid={!!errors.maxPerJourney} />
          </Field>
          <button type="submit" className="hidden" />
        </form>
      </FormDialog>
      <ConfirmDialog
        open={!!pending}
        onOpenChange={(o) => !o && setPending(null)}
        title={`Deactivate ${item?.size ?? "container type"}?`}
        description="This size will no longer be selectable for new movements. Existing movements are not affected."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => pending && commit(pending)}
      />
    </>
  );
}

export function ContainersView() {
  const { db } = useApp();
  const [editing, setEditing] = useState<ContainerType | null>(null);

  const columns: Column<ContainerType>[] = [
    { key: "size", header: "Size", cell: (c) => <span className="font-semibold text-navy">{c.size}</span>, sortValue: (c) => c.size },
    { key: "label", header: "Label", cell: (c) => c.label },
    { key: "teu", header: "TEU", align: "right", cell: (c) => c.teu },
    { key: "max", header: "Max per journey", align: "right", cell: (c) => c.maxPerJourney },
    {
      key: "rule",
      header: "Journey rule",
      className: "text-slate",
      cell: (c) => (c.size === "40FT" ? "One 40FT = one journey" : "Up to two 20FT on one trailer = one journey"),
    },
    {
      key: "mv",
      header: "Movements",
      align: "right",
      cell: (c) => db.movements.filter((m) => m.containerSize === c.size).length,
    },
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (c) => (
        <Button variant="ghost" size="sm" onClick={() => setEditing(c)}>
          <Pencil /> Edit
        </Button>
      ),
    },
  ];

  return (
    <MasterShell title="Container types" description="Standard container sizes for transhipment moves. Sizes are fixed; labels, TEU, per-journey limits and status are editable.">
      <DataTable columns={columns} rows={db.containerTypes} getRowId={(c) => c.size} hidePagerIfSinglePage />
      <ContainerFormDialog item={editing} onClose={() => setEditing(null)} />
    </MasterShell>
  );
}
