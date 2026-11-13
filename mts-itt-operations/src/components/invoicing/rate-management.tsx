"use client";

import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { Ban, CheckCircle2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { NativeSelect } from "@/components/shared/native-select";
import { FormDialog } from "@/components/shared/form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/field";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { addRate, setRateStatus, updateRate, validateRate, type RateInput } from "@/lib/mutations/invoice";
import { demoToday, formatDate } from "@/lib/date-utils";
import { formatMoney } from "@/lib/utils";
import { CONTAINER_SIZES, TERMINAL_CODES, type TerminalCode } from "@/types/terminal";
import type { RateRecord } from "@/types/invoice";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const schema = z
  .object({
    source: z.enum(TERMINAL_CODES),
    destination: z.enum(TERMINAL_CODES),
    containerSize: z.enum(["20FT", "40FT"]),
    baseRate: z.string().trim().refine((v) => Number(v) > 0 && Number.isFinite(Number(v)), "Enter a base rate above zero"),
    effectiveFrom: day,
    effectiveTo: z.string().refine((v) => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v), "Use a valid date"),
    dieselAdjustmentPct: z.string().trim().refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 100, "Enter 0 – 100"),
    status: z.enum(["Active", "Inactive", "Draft"]),
  })
  .refine((v) => v.source !== v.destination, { path: ["destination"], message: "Destination must differ from source" })
  .refine((v) => v.effectiveTo === "" || v.effectiveTo >= v.effectiveFrom, { path: ["effectiveTo"], message: "Must be on or after effective from" });
type Values = z.infer<typeof schema>;

const toInput = (v: Values): RateInput => ({
  source: v.source,
  destination: v.destination,
  containerSize: v.containerSize,
  baseRate: Number(v.baseRate),
  effectiveFrom: v.effectiveFrom,
  effectiveTo: v.effectiveTo || null,
  dieselAdjustmentPct: Number(v.dieselAdjustmentPct),
  status: v.status,
});

const blank: Values = {
  source: "CWIT",
  destination: "JCT",
  containerSize: "20FT",
  baseRate: "",
  effectiveFrom: demoToday(),
  effectiveTo: "",
  dieselAdjustmentPct: "3.5",
  status: "Active",
};

function RateDialog({ rate, open, onClose }: { rate: RateRecord | null; open: boolean; onClose: () => void }) {
  const { db, update } = useApp();
  const { control, register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: rate
      ? {
          source: rate.source,
          destination: rate.destination,
          containerSize: rate.containerSize,
          baseRate: String(rate.baseRate),
          effectiveFrom: rate.effectiveFrom,
          effectiveTo: rate.effectiveTo ?? "",
          dieselAdjustmentPct: String(rate.dieselAdjustmentPct),
          status: rate.status,
        }
      : blank,
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const watched = useWatch({ control });
  const parsed = schema.safeParse(watched);
  const overlap = parsed.success ? validateRate(db.rates, toInput(parsed.data), rate?.id) : null;
  const e = formState.errors;
  const terminals = TERMINAL_CODES.map((c) => ({ value: c, label: c }));

  const submit = handleSubmit((v) => {
    const input = toInput(v);
    const res = update((d) => (rate ? updateRate(d, rate.id, input) : addRate(d, input)));
    if (!res.ok) {
      setServerError(res.error);
      return;
    }
    toast.success(rate ? `Rate ${rate.id} updated` : "Rate added");
    onClose();
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={rate ? `Edit rate ${rate.id}` : "Add rate"}
      description="Rates are effective-dated per route and container size. Active windows for the same route and size cannot overlap."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit}>{rate ? "Save changes" : "Add rate"}</Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <Field label="Source" required error={e.source?.message}>
          <Controller control={control} name="source" render={({ field }) => <NativeSelect value={field.value} onValueChange={(x) => field.onChange(x as TerminalCode)} options={terminals} aria-label="Source" />} />
        </Field>
        <Field label="Destination" required error={e.destination?.message}>
          <Controller control={control} name="destination" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={terminals} aria-label="Destination" />} />
        </Field>
        <Field label="Container size" required error={e.containerSize?.message}>
          <Controller control={control} name="containerSize" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={CONTAINER_SIZES} aria-label="Container size" />} />
        </Field>
        <Field label={`Base rate (${db.settings.currency} per unit)`} required error={e.baseRate?.message}>
          <Input inputMode="decimal" {...register("baseRate")} aria-invalid={!!e.baseRate} />
        </Field>
        <Field label="Effective from" required error={e.effectiveFrom?.message}>
          <Input type="date" {...register("effectiveFrom")} aria-invalid={!!e.effectiveFrom} />
        </Field>
        <Field label="Effective to" error={e.effectiveTo?.message} hint="Leave blank for open-ended.">
          <Input type="date" {...register("effectiveTo")} aria-invalid={!!e.effectiveTo} />
        </Field>
        <Field label="Diesel adjustment %" required error={e.dieselAdjustmentPct?.message} hint="Contractual diesel adjustment is a configurable demo value.">
          <Input inputMode="decimal" {...register("dieselAdjustmentPct")} aria-invalid={!!e.dieselAdjustmentPct} />
        </Field>
        <Field label="Status" required error={e.status?.message}>
          <Controller control={control} name="status" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Active", "Draft", "Inactive"]} aria-label="Status" />} />
        </Field>
        {(serverError || overlap) && (
          <div className="rounded-lg border border-danger/30 bg-danger/5 p-2.5 text-sm text-danger sm:col-span-2" role="alert">
            {serverError ?? overlap}
          </div>
        )}
        <button type="submit" className="hidden" />
      </form>
    </FormDialog>
  );
}

/** Rate master: add / edit / deactivate effective-dated route rates. Also embedded in /master-data/rates. */
export function RateManagement() {
  const { db, update } = useApp();
  const { can } = useAuth();
  const edit = can("rates.edit");
  const [editing, setEditing] = useState<{ rate: RateRecord | null } | null>(null);
  const [deactivate, setDeactivate] = useState<RateRecord | null>(null);
  const [status, setStatus] = useState("");
  const [terminal, setTerminal] = useState("");
  const [size, setSize] = useState("");

  const rows = useMemo(
    () =>
      db.rates.filter(
        (r) => (!status || r.status === status) && (!terminal || r.source === terminal || r.destination === terminal) && (!size || r.containerSize === size),
      ),
    [db.rates, status, terminal, size],
  );
  const currency = db.settings.currency;

  const setStatusOf = (r: RateRecord, s: RateRecord["status"]) => {
    const res = update((d) => setRateStatus(d, r.id, s));
    if (res.ok) toast.success(`Rate ${r.id} ${s === "Active" ? "activated" : "deactivated"}`);
    else toast.error(res.error);
  };

  const columns: Column<RateRecord>[] = [
    { key: "id", header: "ID", sortValue: (r) => r.id, cell: (r) => <span className="font-medium">{r.id}</span> },
    { key: "src", header: "Source", sortValue: (r) => r.source, cell: (r) => r.source },
    { key: "dst", header: "Destination", sortValue: (r) => r.destination, cell: (r) => r.destination },
    { key: "size", header: "Size", sortValue: (r) => r.containerSize, cell: (r) => r.containerSize },
    { key: "rate", header: "Base Rate", align: "right", sortValue: (r) => r.baseRate, cell: (r) => formatMoney(r.baseRate, currency) },
    { key: "from", header: "Effective From", sortValue: (r) => r.effectiveFrom, cell: (r) => formatDate(r.effectiveFrom) },
    { key: "to", header: "Effective To", sortValue: (r) => r.effectiveTo ?? "9999", cell: (r) => (r.effectiveTo ? formatDate(r.effectiveTo) : <span className="text-slate">Open</span>) },
    { key: "diesel", header: "Diesel Adj %", align: "right", sortValue: (r) => r.dieselAdjustmentPct, cell: (r) => `${r.dieselAdjustmentPct}%` },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    ...(edit
      ? [
          {
            key: "actions",
            header: "Actions",
            align: "right" as const,
            cell: (r: RateRecord) => (
              <div className="flex justify-end gap-1">
                <Button size="xs" variant="outline" onClick={() => setEditing({ rate: r })}>
                  <Pencil /> Edit
                </Button>
                {r.status === "Active" ? (
                  <Button size="xs" variant="destructive" onClick={() => setDeactivate(r)}>
                    <Ban /> Deactivate
                  </Button>
                ) : (
                  <Button size="xs" variant="outline" onClick={() => setStatusOf(r, "Active")}>
                    <CheckCircle2 /> Activate
                  </Button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  return (
    <SectionCard
      title="Route rate master"
      description="Effective-dated base rates per route and container size, with the diesel adjustment %. Rate changes are audit logged."
      bodyClassName="p-0"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <NativeSelect className="w-28" value={terminal} onValueChange={setTerminal} placeholder="Terminal" options={TERMINAL_CODES} aria-label="Terminal filter" />
          <NativeSelect className="w-24" value={size} onValueChange={setSize} placeholder="Size" options={CONTAINER_SIZES} aria-label="Size filter" />
          <NativeSelect className="w-32" value={status} onValueChange={setStatus} placeholder="All statuses" options={["Active", "Draft", "Inactive"]} aria-label="Status filter" />
          {edit && (
            <Button size="sm" onClick={() => setEditing({ rate: null })}>
              <Plus /> Add rate
            </Button>
          )}
        </div>
      }
    >
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(r) => r.id}
        initialSort={{ key: "src", dir: "asc" }}
        emptyTitle="No rates match"
        emptyDescription="Adjust the filters or add a rate."
      />
      {editing && <RateDialog key={editing.rate?.id ?? "new"} rate={editing.rate} open onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deactivate}
        onOpenChange={(o) => !o && setDeactivate(null)}
        title="Deactivate this rate?"
        description={
          deactivate
            ? `${deactivate.id} (${deactivate.source}-${deactivate.destination} ${deactivate.containerSize}) will no longer be applied to new invoices. Existing invoices are unchanged.`
            : undefined
        }
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => deactivate && setStatusOf(deactivate, "Inactive")}
      />
    </SectionCard>
  );
}
