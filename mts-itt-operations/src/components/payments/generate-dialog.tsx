"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { z } from "zod";
import { AlertTriangle, FileCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { addDays, formatDate, payPeriods } from "@/lib/date-utils";
import { computePayLines } from "@/lib/payment-calculator";
import { generatePayRun } from "@/lib/mutations/payment";
import { formatMoney, formatNumber } from "@/lib/utils";
import { PayRulesNote, periodLabel, unitModeLabel } from "./payment-summary";

const CUSTOM = "custom";
const startSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid start date");

export function GeneratePayDialog({
  open,
  onOpenChange,
  initialStart,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialStart?: string;
}) {
  const { db, update } = useApp();
  const router = useRouter();
  const periods = useMemo(() => payPeriods(6), []);
  const [choice, setChoice] = useState(initialStart && periods.some((p) => p.start === initialStart) ? initialStart : periods[0].start);
  const [custom, setCustom] = useState(periods[0].start);
  const [busy, setBusy] = useState(false);

  const start = choice === CUSTOM ? custom : choice;
  const parsed = startSchema.safeParse(start);
  const error = choice === CUSTOM && !parsed.success ? parsed.error.issues[0].message : undefined;
  const end = parsed.success ? addDays(start, 14) : "";

  const existing = parsed.success ? db.payRuns.find((r) => r.periodStart === start && r.periodEnd === end) : undefined;
  const preview = useMemo(() => {
    if (!parsed.success) return null;
    const lines = computePayLines(db, start, end, existing?.status === "Draft" ? existing.lines : undefined);
    return {
      drivers: lines.length,
      eligible: lines.reduce((s, l) => s + l.movementIds.length, 0),
      excluded: lines.reduce((s, l) => s + l.excluded.length, 0),
      units: lines.reduce((s, l) => s + l.payableUnits, 0),
      total: lines.reduce((s, l) => s + l.total, 0),
    };
  }, [db, start, end, existing, parsed.success]);

  const blocked = existing?.status === "Approved";

  const submit = () => {
    if (!parsed.success || blocked) return;
    setBusy(true);
    const res = update((d) => generatePayRun(d, { start, end }));
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success(res.regenerated ? `Draft ${res.id} regenerated` : `Draft ${res.id} generated`, {
      description: res.regenerated ? "Existing adjustments were preserved." : periodLabel(start, end),
    });
    onOpenChange(false);
    router.push(`/payments/${res.id}`);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Generate pay draft"
      description="Pick a 15-day pay period. Eligible movements are retrieved and priced from the configured rates; exclusions are listed with reasons."
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!parsed.success || blocked || busy}>
            <FileCog /> {existing?.status === "Draft" ? "Regenerate draft" : "Generate draft"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Pay period" required>
          <NativeSelect
            value={choice}
            onValueChange={setChoice}
            options={[
              ...periods.map((p) => ({ value: p.start, label: periodLabel(p.start, p.end) })),
              { value: CUSTOM, label: "Custom start date (15 days)…" },
            ]}
            aria-label="Pay period"
          />
        </Field>
        {choice === CUSTOM && (
          <Field label="Custom start date" required error={error} hint={parsed.success ? `Period ends ${formatDate(end)} (start + 14 days).` : undefined}>
            <Input type="date" value={custom} onChange={(e) => setCustom(e.target.value)} aria-invalid={!!error} />
          </Field>
        )}

        {blocked && (
          <div className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            This period already has an Approved pay run ({existing?.id}). Approved runs are immutable and cannot be regenerated.
          </div>
        )}
        {existing?.status === "Draft" && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-amber-700">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            Draft {existing.id} already exists for this period. Generating will refresh it from current movements and preserve its adjustments.
          </div>
        )}

        {preview && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border bg-muted/40 p-3 text-sm sm:grid-cols-4">
            <div><div className="text-xs text-slate">Drivers</div><div className="font-semibold">{preview.drivers}</div></div>
            <div><div className="text-xs text-slate">Eligible movements</div><div className="font-semibold">{preview.eligible}</div></div>
            <div><div className="text-xs text-slate">Excluded</div><div className="font-semibold text-amber-600">{preview.excluded}</div></div>
            <div><div className="text-xs text-slate">Draft total</div><div className="font-semibold">{formatMoney(preview.total, db.settings.currency)}</div></div>
            <div className="col-span-2 text-xs text-slate sm:col-span-4">
              {formatNumber(preview.units)} payable units · {unitModeLabel(db.settings.payUnitMode)}
            </div>
          </div>
        )}
        <PayRulesNote unitMode={db.settings.payUnitMode} rates={db.settings.payRates} currency={db.settings.currency} />
      </div>
    </FormDialog>
  );
}
