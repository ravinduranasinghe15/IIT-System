"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, CheckCircle2, Download, Lock, RefreshCw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field } from "@/components/shared/field";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { formatDateTime } from "@/lib/date-utils";
import { downloadCsv } from "@/lib/export-utils";
import { approvePayRun, generatePayRun, isSubmitted, setPayAdjustment, submitPayRun } from "@/lib/mutations/payment";
import { formatMoney } from "@/lib/utils";
import type { PayLine } from "@/types/payment";
import { PayLinesTable } from "./payment-table";
import { PayRulesNote, PaySummaryCards, periodLabel } from "./payment-summary";
import { PayBreakdownDialog } from "./payment-breakdown";

const adjustSchema = z.object({
  amount: z
    .string()
    .trim()
    .min(1, "Enter an amount (use a negative number for a deduction, 0 to clear)")
    .refine((v) => Number.isFinite(Number(v)), "Amount must be a number")
    .refine((v) => Math.abs(Number(v)) <= 100000, "Amount is out of range"),
  note: z.string().trim().max(200, "Keep the note under 200 characters"),
});
type AdjustValues = z.infer<typeof adjustSchema>;

function AdjustDialog({
  runId,
  line,
  currency,
  onClose,
}: {
  runId: string;
  line: PayLine | null;
  currency: string;
  onClose: () => void;
}) {
  const { update } = useApp();
  const form = useForm<AdjustValues>({
    resolver: zodResolver(adjustSchema),
    values: { amount: line ? String(line.adjustments) : "0", note: line?.adjustmentNote ?? "" },
  });
  const { register, handleSubmit, formState } = form;

  const onSubmit = handleSubmit((v) => {
    if (!line) return;
    const amount = Number(v.amount);
    if (amount !== 0 && !v.note.trim()) {
      form.setError("note", { message: "A note is required for any adjustment" });
      return;
    }
    const res = update((d) => setPayAdjustment(d, runId, line.driverId, amount, v.note));
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(`Adjustment saved for ${line.driverName}`);
    onClose();
  });

  return (
    <FormDialog
      open={!!line}
      onOpenChange={(o) => !o && onClose()}
      title={line ? `Adjustment – ${line.driverName}` : "Adjustment"}
      description="Set the total adjustment for this driver (bonus, allowance or deduction). Recorded in the audit log."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onSubmit}>Save adjustment</Button>
        </>
      }
    >
      {line && (
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="rounded-lg bg-muted/50 p-2.5 text-sm text-slate">
            Base {formatMoney(line.baseAmount, currency)} ({line.payableUnits} units). Total = base + adjustment.
          </div>
          <Field label={`Adjustment amount (${currency})`} required error={formState.errors.amount?.message}>
            <Input inputMode="decimal" {...register("amount")} aria-invalid={!!formState.errors.amount} />
          </Field>
          <Field label="Note" error={formState.errors.note?.message} hint="Required when the amount is not zero.">
            <Textarea rows={2} {...register("note")} aria-invalid={!!formState.errors.note} />
          </Field>
          <button type="submit" className="hidden" />
        </form>
      )}
    </FormDialog>
  );
}

export function PayRunDetail() {
  const { id } = useParams<{ id: string }>();
  const { db, update } = useApp();
  const { can, canSeeFinancials } = useAuth();
  const [breakdown, setBreakdown] = useState<PayLine | null>(null);
  const [adjusting, setAdjusting] = useState<PayLine | null>(null);
  const [confirm, setConfirm] = useState<"submit" | "approve" | "regen" | null>(null);
  const [note, setNote] = useState("");

  const run = db.payRuns.find((r) => r.id === id);
  if (!canSeeFinancials) return null;
  if (!run) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          title="Pay run not found"
          description={`No pay run with id ${id} exists in the demo data.`}
          action={<Button render={<Link href="/payments" />} nativeButton={false} variant="outline"><ArrowLeft /> Back to payments</Button>}
        />
      </div>
    );
  }

  const draft = run.status === "Draft";
  const submitted = isSubmitted(run);
  const manage = can("payments.manage") && draft;

  const act = (fn: () => ReturnType<typeof approvePayRun>, ok: string) => {
    const res = fn();
    if (!res.ok) toast.error(res.error);
    else toast.success(ok);
    setNote("");
  };

  const exportCsv = () =>
    downloadCsv(
      `${run.id}-driver-pay`,
      run.lines.map((l) => ({
        "Pay Run": run.id,
        Period: `${run.periodStart} to ${run.periodEnd}`,
        "Driver ID": l.driverId,
        Name: l.driverName,
        "Completed Movements": l.completedMovements,
        "Eligible Payable Units": l.payableUnits,
        "Blended Rate": l.rate,
        "Base Amount": l.baseAmount,
        Adjustments: l.adjustments,
        "Adjustment Note": l.adjustmentNote,
        "Total Earnings": l.total,
        "Excluded Movements": l.excluded.length,
        Currency: run.currency,
        Status: run.status,
      })),
    );

  return (
    <div>
      <PageHeader
        title={`Pay run ${run.id}`}
        description={`Period ${periodLabel(run.periodStart, run.periodEnd)} · generated ${formatDateTime(run.generatedAt)} by ${run.generatedBy}`}
        badge={<StatusBadge status={run.status === "Draft" && submitted ? "Draft – submitted" : run.status} className={run.status === "Draft" && submitted ? "!bg-sky-50 !text-sky-700 !ring-sky-600/20" : undefined} />}
        actions={
          <>
            <Button variant="outline" render={<Link href="/payments" />} nativeButton={false}><ArrowLeft /> All pay runs</Button>
            <Button variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>
            {manage && (
              <Button variant="outline" onClick={() => setConfirm("regen")}><RefreshCw /> Regenerate</Button>
            )}
            {manage && !submitted && (
              <Button onClick={() => setConfirm("submit")}><Send /> Submit for approval</Button>
            )}
            {draft && can("payments.approve") && (
              <Button onClick={() => setConfirm("approve")} disabled={!submitted} title={submitted ? undefined : "Submit the draft first"}>
                <CheckCircle2 /> Approve (simulated)
              </Button>
            )}
          </>
        }
      />

      {!draft && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-3 py-2 text-sm text-success">
          <Lock className="size-4" /> Approved by {run.approvedBy} on {formatDateTime(run.approvedAt)}. This pay run is immutable (simulated approval – no payment is made).
        </div>
      )}
      {draft && (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-amber-700">
          Draft – not approved. Only an authorised Finance Manager or Administrator can approve. Adjusting or regenerating after submission requires re-submission.
        </div>
      )}

      <PaySummaryCards run={run} />
      <div className="mt-4">
        <PayRulesNote unitMode={run.unitMode} rates={run.rates} currency={run.currency} />
      </div>

      <SectionCard className="mt-4" title="Driver earnings" description="Open a breakdown to see every included and excluded movement." bodyClassName="p-0">
        <PayLinesTable
          lines={run.lines}
          currency={run.currency}
          status={run.status}
          editable={manage}
          onBreakdown={setBreakdown}
          onAdjust={setAdjusting}
          pageSize={5}
        />
      </SectionCard>

      <SectionCard className="mt-4" title="Approval history" description="Every change to this pay run is recorded here and in the audit log.">
        <ol className="space-y-3">
          {[...run.history].reverse().map((h, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <div className={`mt-1.5 size-2 shrink-0 rounded-full ${h.action === "Approved" ? "bg-success" : "bg-brand"}`} />
              <div className="min-w-0">
                <div className="font-medium text-ink">{h.action}</div>
                <div className="text-xs text-slate">{formatDateTime(h.at)} · {h.by}</div>
                {h.note && <div className="mt-0.5 text-slate">{h.note}</div>}
              </div>
            </li>
          ))}
        </ol>
      </SectionCard>

      <PayBreakdownDialog line={breakdown} onClose={() => setBreakdown(null)} unitMode={run.unitMode} rates={run.rates} currency={run.currency} />
      <AdjustDialog runId={run.id} line={adjusting} currency={run.currency} onClose={() => setAdjusting(null)} />

      <ConfirmDialog
        open={confirm === "regen"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Regenerate this draft?"
        description="Movements and rates are re-read from current data. Adjustments are preserved. The draft must be re-submitted."
        confirmLabel="Regenerate"
        onConfirm={() => act(() => update((d) => generatePayRun(d, { start: run.periodStart, end: run.periodEnd })), "Draft regenerated")}
      />
      <ConfirmDialog
        open={confirm === "submit"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Submit for approval?"
        description="Confirms you have reviewed every driver breakdown and excluded movement."
        confirmLabel="Submit"
        onConfirm={() => act(() => update((d) => submitPayRun(d, run.id, note)), "Submitted for approval")}
      >
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the approver" />
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "approve"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Approve this pay run?"
        description={`Approving ${run.id} (${formatMoney(run.lines.reduce((s, l) => s + l.total, 0), run.currency)}) is simulated and recorded in the audit log. Approved runs are immutable.`}
        confirmLabel="Approve"
        onConfirm={() => act(() => update((d) => approvePayRun(d, run.id, note)), "Pay run approved (simulated)")}
      >
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional approval note" />
      </ConfirmDialog>
    </div>
  );
}
