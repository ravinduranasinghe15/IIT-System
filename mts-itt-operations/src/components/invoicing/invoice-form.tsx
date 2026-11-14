"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";
import { AlertTriangle, ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { calculateInvoice } from "@/lib/invoice-calculator";
import { createInvoiceDraft } from "@/lib/mutations/invoice";
import { demoToday, formatDate, formatMonth, monthOf } from "@/lib/date-utils";
import { ASSUMPTION_NOTE } from "@/lib/constants";
import { formatMoney } from "@/lib/utils";
import type { InvoiceLine } from "@/types/invoice";
import { ExcludedTable, InvoiceTotals, lineColumns } from "./invoice-parts";

const schema = z
  .object({
    terminal: z.enum(["CWIT", "SAGT", "CICT"]),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a billing month"),
    route: z.string(),
    size: z.enum(["", "20FT", "40FT"]),
    dieselMode: z.enum(["rate-card", "override"]),
    dieselPct: z.string(),
  })
  .refine((v) => v.dieselMode === "rate-card" || (v.dieselPct.trim() !== "" && Number.isFinite(Number(v.dieselPct)) && Number(v.dieselPct) >= 0 && Number(v.dieselPct) <= 100), {
    path: ["dieselPct"],
    message: "Enter a diesel override between 0 and 100",
  });
type Values = z.infer<typeof schema>;

export function InvoiceForm() {
  const { db, update } = useApp();
  const { can, canSeeFinancials } = useAuth();
  const router = useRouter();
  const { control, register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { terminal: "CWIT", month: monthOf(demoToday()), route: "", size: "", dieselMode: "rate-card", dieselPct: "" },
  });
  const v = useWatch({ control }) as Values;
  const currency = db.settings.currency;

  const sources = db.terminals.filter((t) => t.role !== "Destination" && t.status !== "Inactive");
  const routeOptions = db.routes
    .filter((r) => r.source === v.terminal && r.status !== "Inactive")
    .map((r) => ({ value: `${r.source}-${r.destination}`, label: `${r.source} → ${r.destination} (${r.code})` }));

  const parsed = schema.safeParse(v);
  const calc = useMemo(() => {
    if (!parsed.success) return null;
    const d = parsed.data;
    return calculateInvoice(db, {
      terminal: d.terminal,
      month: d.month,
      route: d.route || null,
      size: d.size || null,
      dieselOverridePct: d.dieselMode === "override" ? Number(d.dieselPct) : null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, v.terminal, v.month, v.route, v.size, v.dieselMode, v.dieselPct, parsed.success]);

  if (!canSeeFinancials) return null;
  if (!can("invoice.manage")) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState title="Not permitted" description="Your role cannot create invoice drafts." action={<Button variant="outline" render={<Link href="/invoicing" />} nativeButton={false}>Back to invoicing</Button>} />
      </div>
    );
  }

  const onSave = handleSubmit((d) => {
    const res = update((draft) =>
      createInvoiceDraft(draft, {
        terminal: d.terminal,
        month: d.month,
        route: d.route || null,
        size: d.size || null,
        dieselOverridePct: d.dieselMode === "override" ? Number(d.dieselPct) : null,
      }),
    );
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Invoice draft saved", { description: "It stays a draft until an authorised manager approves it." });
    router.push(`/invoicing/${res.id}`);
  });

  const lines = calc?.lines ?? [];
  const cols: Column<InvoiceLine>[] = lineColumns(currency);
  const e = formState.errors;

  return (
    <div>
      <PageHeader
        title="New invoice draft"
        description="Select the terminal and billing month. Eligible billable movements are retrieved, priced from effective-dated rates and totalled live."
        actions={
          <Button variant="outline" render={<Link href="/invoicing" />} nativeButton={false}>
            <ArrowLeft /> Back
          </Button>
        }
      />

      <SectionCard title="Invoice criteria" description="Unresolved exceptions, unapproved corrections, missing rates and movements already invoiced are excluded automatically.">
        <form onSubmit={onSave} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Terminal" required error={e.terminal?.message}>
            <Controller
              control={control}
              name="terminal"
              render={({ field }) => (
                <NativeSelect
                  value={field.value}
                  onValueChange={(x) => {
                    field.onChange(x);
                  }}
                  options={sources.map((t) => ({ value: t.code, label: `${t.code} – ${t.name}${t.status === "Conditional" ? " (conditional)" : ""}` }))}
                  aria-label="Terminal"
                />
              )}
            />
          </Field>
          <Field label="Billing month" required error={e.month?.message}>
            <Input type="month" {...register("month")} aria-invalid={!!e.month} />
          </Field>
          <Field label="Route" hint="Optional – all routes from this terminal by default.">
            <Controller control={control} name="route" render={({ field }) => <NativeSelect value={routeOptions.some((o) => o.value === field.value) ? field.value : ""} onValueChange={field.onChange} placeholder="All routes" options={routeOptions} aria-label="Route" />} />
          </Field>
          <Field label="Container size">
            <Controller control={control} name="size" render={({ field }) => <NativeSelect value={field.value} onValueChange={(x) => field.onChange(x as Values["size"])} placeholder="All sizes" options={["20FT", "40FT"]} aria-label="Container size" />} />
          </Field>
          <Field label="Diesel adjustment" hint="Rate-card uses each rate's diesel %; override applies one % to every line.">
            <Controller control={control} name="dieselMode" render={({ field }) => <NativeSelect value={field.value} onValueChange={(x) => field.onChange(x as Values["dieselMode"])} options={[{ value: "rate-card", label: "Rate-card %" }, { value: "override", label: "Override %" }]} aria-label="Diesel mode" />} />
          </Field>
          {v.dieselMode === "override" && (
            <Field label="Override diesel %" required error={e.dieselPct?.message}>
              <Input inputMode="decimal" placeholder="e.g. 3.5" {...register("dieselPct")} aria-invalid={!!e.dieselPct} />
            </Field>
          )}
          <button type="submit" className="hidden" />
        </form>
        <p className="mt-3 text-xs text-slate">
          Billing unit mode: <span className="font-medium text-ink">{db.settings.billingUnitMode === "per-trailer" ? "per trailer (1 unit per journey)" : "per container"}</span>. {ASSUMPTION_NOTE}{" "}
          <Link href="/settings" className="font-medium text-brand hover:underline">Settings</Link>
        </p>
      </SectionCard>

      {calc && (
        <>
          <div className="mt-4">
            <InvoiceTotals base={calc.baseAmount} diesel={calc.dieselAmount} final={calc.finalAmount} currency={currency} movements={lines.length} excluded={calc.excluded.length} />
          </div>

          <SectionCard
            className="mt-4"
            title={`Eligible movements – ${v.terminal} · ${formatMonth(v.month)}`}
            description={`Operational days ${formatDate(`${v.month}-01`)} onwards (07:00 to 07:00).`}
            bodyClassName="p-0"
            actions={
              <Button onClick={onSave} disabled={!lines.length}>
                <Save /> Save draft ({formatMoney(calc.finalAmount, currency)})
              </Button>
            }
          >
            {lines.length ? (
              <DataTable columns={cols} rows={lines} getRowId={(l) => l.movementId} pageSize={5} hidePagerIfSinglePage />
            ) : (
              <EmptyState title="No eligible movements" description="No billable movements with an effective rate match these criteria for the month." />
            )}
          </SectionCard>

          <SectionCard
            className="mt-4"
            title={
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="size-4 text-amber-600" /> Excluded movements ({calc.excluded.length})
              </span>
            }
            description="These never silently become billable – resolve them and re-create the draft."
            bodyClassName="p-0"
          >
            <ExcludedTable excluded={calc.excluded} />
          </SectionCard>
        </>
      )}
    </div>
  );
}
