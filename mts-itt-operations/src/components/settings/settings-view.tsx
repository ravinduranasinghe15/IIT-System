"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { ArrowRight, History, Info, Lock, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { ASSUMPTION_NOTE, CURRENCIES } from "@/lib/constants";
import { saveSettings } from "@/lib/mutations/settings";
import type { Settings } from "@/types/db";

const TIMEZONES = [
  { value: "Asia/Colombo", label: "Asia/Colombo (UTC+05:30)" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata (UTC+05:30)" },
  { value: "Asia/Dubai", label: "Asia/Dubai (UTC+04:00)" },
  { value: "Asia/Singapore", label: "Asia/Singapore (UTC+08:00)" },
  { value: "Australia/Sydney", label: "Australia/Sydney (UTC+10:00/+11:00)" },
  { value: "UTC", label: "UTC (UTC+00:00)" },
];

const UNIT_MODES = [
  { value: "per-trailer", label: "Per trailer / journey (1 unit per journey)" },
  { value: "per-container", label: "Per container (1 unit per container)" },
];

const money = (label: string) => z.number({ error: `Enter ${label}` }).min(0, "Cannot be negative").max(1000000, "Value is too large");

const schema = z.object({
  timezone: z.string().min(1, "Select a timezone"),
  opDayStartHour: z.number({ error: "Enter an hour" }).int("Whole hour only").min(0, "0–23").max(23, "0–23"),
  currency: z.string().min(1, "Select a currency"),
  billingUnitMode: z.enum(["per-trailer", "per-container"]),
  payUnitMode: z.enum(["per-trailer", "per-container"]),
  pay20: money("a 20FT pay rate"),
  pay40: money("a 40FT pay rate"),
  billRejected: z.boolean(),
  billDamaged: z.boolean(),
  payRejected: z.boolean(),
  payDamaged: z.boolean(),
  requireManagerApproval: z.boolean(),
  driversPerTruck: z.string().regex(/^\d{0,2}$/, "Whole number up to 99, or leave blank"),
  fuelVarianceThresholdPct: z.number({ error: "Enter a percentage" }).min(0, "Cannot be negative").max(100, "Max 100%"),
  ocrConfidenceThreshold: z.number({ error: "Enter a percentage" }).min(0, "0–100").max(100, "0–100"),
});
type Values = z.infer<typeof schema>;

const toValues = (s: Settings): Values => ({
  timezone: s.timezone,
  opDayStartHour: s.opDayStartHour,
  currency: s.currency,
  billingUnitMode: s.billingUnitMode,
  payUnitMode: s.payUnitMode,
  pay20: s.payRates["20FT"],
  pay40: s.payRates["40FT"],
  billRejected: s.billRejected,
  billDamaged: s.billDamaged,
  payRejected: s.payRejected,
  payDamaged: s.payDamaged,
  requireManagerApproval: s.requireManagerApproval,
  driversPerTruck: s.driversPerTruck === null ? "" : String(s.driversPerTruck),
  fuelVarianceThresholdPct: s.fuelVarianceThresholdPct,
  ocrConfidenceThreshold: s.ocrConfidenceThreshold,
});

function Assumption({ children }: { children?: ReactNode }) {
  return (
    <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <strong>Demo assumption – to be confirmed by MTS.</strong> {children ?? ASSUMPTION_NOTE}
      </span>
    </p>
  );
}

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-slate">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

export function SettingsView() {
  const { db, update, reset } = useApp();
  const { can } = useAuth();
  const [confirmReset, setConfirmReset] = useState(false);
  const { register, control, handleSubmit, reset: resetForm, formState } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(db.settings) });
  const { errors, isDirty } = formState;

  // keep the form in sync with the stored settings (after save or demo reset)
  useEffect(() => {
    resetForm(toValues(db.settings));
  }, [db.settings, resetForm]);

  if (!can("settings.manage")) {
    return (
      <div className="mx-auto max-w-md rounded-xl border bg-card py-6 shadow-sm">
        <EmptyState icon={Lock} title="Administrator only" description="Settings, user management and audit logs are limited to the Administrator demo role." />
      </div>
    );
  }

  const onSubmit = handleSubmit((v) => {
    const { pay20, pay40, driversPerTruck, ...rest } = v;
    const res = update((d) =>
      saveSettings(d, {
        ...rest,
        payRates: { "20FT": pay20, "40FT": pay40 },
        driversPerTruck: driversPerTruck === "" ? null : Number(driversPerTruck),
      }),
    );
    if (!res.ok) return void toast.error(res.error);
    toast.success("Settings saved", { description: "Changes are audit-logged and apply to new calculations." });
  });

  const toggle = (name: "billRejected" | "billDamaged" | "payRejected" | "payDamaged" | "requireManagerApproval", label: string, hint: string) => (
    <Controller control={control} name={name} render={({ field }) => <ToggleRow label={label} hint={hint} checked={field.value} onChange={field.onChange} />} />
  );

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Business rules and system configuration for the demo. Contractual treatments are assumptions until MTS confirms them."
        actions={
          <>
            <Button variant="outline" size="sm" disabled={!isDirty} onClick={() => resetForm(toValues(db.settings))}>
              Discard changes
            </Button>
            <Button size="sm" disabled={!isDirty} onClick={onSubmit}>
              Save settings
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { href: "/settings/users", icon: Users, title: "User management", text: `${db.users.length} demo users across six roles` },
          { href: "/settings/roles", icon: ShieldCheck, title: "Role access matrix", text: "Read-only view of demo permissions" },
          { href: "/settings/audit-logs", icon: History, title: "Audit logs", text: `${db.audit.length} recorded activities` },
        ].map((l) => (
          <Link key={l.href} href={l.href} className="group flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-sm transition hover:border-brand/40 hover:shadow-md">
            <div className="flex size-9 items-center justify-center rounded-lg bg-navy/10 text-navy">
              <l.icon className="size-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-navy">{l.title}</div>
              <div className="truncate text-xs text-slate">{l.text}</div>
            </div>
            <ArrowRight className="size-4 text-slate group-hover:text-brand" />
          </Link>
        ))}
      </div>

      <form onSubmit={onSubmit} className="grid gap-5 xl:grid-cols-2">
        <SectionCard title="System" description="Time, operational day and currency">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Timezone" required error={errors.timezone?.message} hint="All timestamps are shown as wall-clock time in this zone.">
              <Controller control={control} name="timezone" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={TIMEZONES} />} />
            </Field>
            <Field label="Operational day start hour" required error={errors.opDayStartHour?.message} hint="7 = operational day runs 07:00 → 07:00.">
              <Input type="number" min={0} max={23} {...register("opDayStartHour", { valueAsNumber: true })} aria-invalid={!!errors.opDayStartHour} />
            </Field>
            <Field label="Currency" required error={errors.currency?.message} hint="Demo currency for all amounts.">
              <Controller control={control} name="currency" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={CURRENCIES} />} />
            </Field>
          </div>
        </SectionCard>

        <SectionCard title="Billing and pay units" description="How journeys and containers translate into billable and payable units">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Billing unit mode" required error={errors.billingUnitMode?.message}>
              <Controller control={control} name="billingUnitMode" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={UNIT_MODES} />} />
            </Field>
            <Field label="Pay unit mode" required error={errors.payUnitMode?.message}>
              <Controller control={control} name="payUnitMode" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={UNIT_MODES} />} />
            </Field>
            <Field label="Driver pay rate – 20FT" required error={errors.pay20?.message} hint={`${db.settings.currency} per payable unit`}>
              <Input type="number" step="0.01" {...register("pay20", { valueAsNumber: true })} aria-invalid={!!errors.pay20} />
            </Field>
            <Field label="Driver pay rate – 40FT" required error={errors.pay40?.message} hint={`${db.settings.currency} per payable unit`}>
              <Input type="number" step="0.01" {...register("pay40", { valueAsNumber: true })} aria-invalid={!!errors.pay40} />
            </Field>
          </div>
          <Assumption />
        </SectionCard>

        <SectionCard title="Rejected and damaged deliveries" description="Whether these movements are billed to terminals or paid to drivers">
          <div className="space-y-2">
            {toggle("billRejected", "Bill rejected deliveries", "Include Rejected movements in terminal invoices")}
            {toggle("billDamaged", "Bill damaged deliveries", "Include Damaged movements in terminal invoices")}
          </div>
          <Assumption />
        </SectionCard>

        <SectionCard title="Controls and thresholds" description="Approvals, staffing note, fuel and extraction thresholds">
          <div className="space-y-4">
            {toggle("requireManagerApproval", "Require manager approval for material corrections", "Financially material movement corrections wait for an Operations Manager or Administrator")}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Drivers per truck (optional)" error={errors.driversPerTruck?.message} hint="Unconfirmed – leave blank for no rule.">
                <Input inputMode="numeric" placeholder="Not set" {...register("driversPerTruck")} aria-invalid={!!errors.driversPerTruck} />
              </Field>
              <Field label="Fuel variance threshold (%)" required error={errors.fuelVarianceThresholdPct?.message} hint="GPS vs invoice litres above this are flagged.">
                <Input type="number" step="0.5" {...register("fuelVarianceThresholdPct", { valueAsNumber: true })} aria-invalid={!!errors.fuelVarianceThresholdPct} />
              </Field>
              <Field label="OCR confidence threshold (%)" required error={errors.ocrConfidenceThreshold?.message} hint="Below this, extracted fields are flagged.">
                <Input type="number" step="1" {...register("ocrConfidenceThreshold", { valueAsNumber: true })} aria-invalid={!!errors.ocrConfidenceThreshold} />
              </Field>
            </div>
            <Assumption>
              Staffing (9 prime movers / 14 drivers / “3 drivers per truck”) is unconfirmed and never enforced. Extraction is simulated and always needs human verification.
            </Assumption>
          </div>
        </SectionCard>
        <button type="submit" className="hidden" />
      </form>

      <SectionCard
        className="mt-5"
        title="Reset demo data"
        description="Wipes every change made in this browser and restores the original seeded demo dataset."
        actions={
          <Button variant="destructive" size="sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw /> Reset demo data
          </Button>
        }
      >
        <p className="text-sm text-slate">Use this before a fresh walkthrough. Users, movements, imports, payments, invoices and audit history all return to their starting state.</p>
      </SectionCard>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset all demo data?"
        description="This permanently discards every change made in this browser and re-seeds the demo database. It cannot be undone."
        confirmLabel="Reset demo data"
        destructive
        onConfirm={() => {
          reset();
          toast.success("Demo data reset to the original seed");
        }}
      />
    </div>
  );
}
