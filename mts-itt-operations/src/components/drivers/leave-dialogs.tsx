"use client";

import { useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Check, X } from "lucide-react";
import { FormDialog } from "@/components/shared/form-dialog";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { SectionCard } from "@/components/shared/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useDriverActions } from "@/hooks/use-drivers";
import { realToday, formatDate } from "@/lib/date-utils";
import type { LeaveRecord } from "@/types/driver";

const schema = z
  .object({
    driverId: z.string().min(1, "Select a driver"),
    type: z.enum(["Annual", "Sick", "Casual", "Unpaid"]),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select the first day of leave"),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select the last day of leave"),
    reason: z.string().trim().min(3, "Give a short reason").max(200),
  })
  .refine((v) => v.to >= v.from, { path: ["to"], message: "End date must be on or after the start date" })
  .refine((v) => v.from <= v.to && Date.parse(v.to) - Date.parse(v.from) <= 60 * 86_400_000, { path: ["to"], message: "Leave requests are limited to 60 days" });
type Values = z.infer<typeof schema>;

export function LeaveRequestDialog({ open, onOpenChange, fixedDriverId }: { open: boolean; onOpenChange: (o: boolean) => void; fixedDriverId?: string }) {
  const { db } = useApp();
  const actions = useDriverActions();
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { driverId: fixedDriverId ?? "", type: "Annual", from: realToday(), to: realToday(), reason: "" },
  });

  const submit = handleSubmit((v) => {
    const clash = db.leaves.find((l) => l.driverId === v.driverId && l.status !== "Rejected" && v.from <= l.to && v.to >= l.from);
    if (clash) {
      setError("from", { message: `Overlaps ${clash.status.toLowerCase()} leave ${clash.id} (${formatDate(clash.from)} – ${formatDate(clash.to)})` });
      return;
    }
    if (actions.requestLeave(v)) onOpenChange(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Request leave"
      description="The request stays Pending until approved. Approval sets the driver's roster days to Leave."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="leave-request-form">
            Submit request
          </Button>
        </>
      }
    >
      <form id="leave-request-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Driver" required error={errors.driverId?.message} className="sm:col-span-2">
          <Controller
            control={control}
            name="driverId"
            render={({ field }) => (
              <NativeSelect
                value={field.value}
                onValueChange={field.onChange}
                disabled={!!fixedDriverId}
                placeholder="Select driver"
                options={db.drivers.map((d) => ({ value: d.id, label: `${d.id} · ${d.name}` }))}
              />
            )}
          />
        </Field>
        <Field label="Leave type" required error={errors.type?.message}>
          <Controller control={control} name="type" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={["Annual", "Sick", "Casual", "Unpaid"]} />} />
        </Field>
        <div />
        <Field label="From" required error={errors.from?.message}>
          <Input type="date" {...register("from")} />
        </Field>
        <Field label="To" required error={errors.to?.message}>
          <Input type="date" {...register("to")} />
        </Field>
        <Field label="Reason" required error={errors.reason?.message} className="sm:col-span-2">
          <Textarea rows={2} {...register("reason")} placeholder="e.g. Family event" />
        </Field>
      </form>
    </FormDialog>
  );
}

/** Leave requests table with approve / reject (roster managers and supervisors). */
export function LeavePanel({ driverId, onRequest }: { driverId?: string; onRequest?: () => void }) {
  const { db } = useApp();
  const { can } = useAuth();
  const actions = useDriverActions();
  const [confirm, setConfirm] = useState<{ leave: LeaveRecord; decision: "Approved" | "Rejected" } | null>(null);
  const [filter, setFilter] = useState("");
  const decide = can("roster.edit") || can("roster.attendance");

  const rows = useMemo(
    () =>
      db.leaves
        .filter((l) => (!driverId || l.driverId === driverId) && (!filter || l.status === filter))
        .sort((a, b) => (a.status === "Pending" ? -1 : 0) - (b.status === "Pending" ? -1 : 0) || b.from.localeCompare(a.from)),
    [db.leaves, driverId, filter],
  );
  const name = (id: string) => db.drivers.find((d) => d.id === id)?.name ?? id;

  const columns: Column<LeaveRecord>[] = [
    { key: "id", header: "Leave ID", cell: (l) => <span className="font-medium text-navy">{l.id}</span> },
    ...(driverId ? [] : [{ key: "driver", header: "Driver", sortValue: (l: LeaveRecord) => name(l.driverId), cell: (l: LeaveRecord) => `${name(l.driverId)} (${l.driverId})` }]),
    { key: "type", header: "Type", cell: (l) => l.type },
    { key: "period", header: "Period", sortValue: (l) => l.from, cell: (l) => <span className="whitespace-nowrap">{formatDate(l.from)} – {formatDate(l.to)}</span> },
    { key: "reason", header: "Reason", cell: (l) => <span className="text-slate">{l.reason}</span> },
    { key: "st", header: "Status", sortValue: (l) => l.status, cell: (l) => <StatusBadge status={l.status} /> },
    { key: "by", header: "Decided by", cell: (l) => l.decidedBy ?? "—" },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (l) =>
        decide && l.status === "Pending" ? (
          <div className="flex justify-end gap-1.5">
            <Button size="xs" onClick={() => setConfirm({ leave: l, decision: "Approved" })}>
              <Check /> Approve
            </Button>
            <Button size="xs" variant="outline" onClick={() => setConfirm({ leave: l, decision: "Rejected" })}>
              <X /> Reject
            </Button>
          </div>
        ) : null,
    },
  ];

  return (
    <SectionCard
      title="Leave management"
      description="Approved leave is written into the roster as Leave days."
      bodyClassName="p-0"
      actions={
        <>
          <NativeSelect className="w-32" value={filter} onValueChange={setFilter} placeholder="All" options={["Pending", "Approved", "Rejected"]} aria-label="Leave status filter" />
          {onRequest && (
            <Button size="sm" onClick={onRequest}>
              Request leave
            </Button>
          )}
        </>
      }
    >
      <DataTable columns={columns} rows={rows} getRowId={(l) => l.id} pageSize={5} pageSizeOptions={[5, 10, 25]} hidePagerIfSinglePage emptyTitle="No leave records" emptyDescription="Leave requests will appear here." />
      {confirm && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirm(null)}
          title={`${confirm.decision === "Approved" ? "Approve" : "Reject"} leave ${confirm.leave.id}?`}
          description={
            confirm.decision === "Approved"
              ? `${name(confirm.leave.driverId)} will be set to Leave on the roster from ${formatDate(confirm.leave.from)} to ${formatDate(confirm.leave.to)}.`
              : `${name(confirm.leave.driverId)}'s request for ${formatDate(confirm.leave.from)} – ${formatDate(confirm.leave.to)} will be rejected.`
          }
          confirmLabel={confirm.decision === "Approved" ? "Approve leave" : "Reject leave"}
          destructive={confirm.decision === "Rejected"}
          onConfirm={() => actions.decideLeave(confirm.leave.id, confirm.decision)}
        />
      )}
    </SectionCard>
  );
}
