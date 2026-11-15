"use client";

import type { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { SectionCard } from "@/components/shared/section-card";
import { addDays, demoToday, monthRange } from "@/lib/date-utils";
import { defaultFilters, routeOptions, type FilterKey, type ReportFilters } from "@/lib/reports";
import { MOVEMENT_STATUSES } from "@/types/movement";
import { CONTAINER_SIZES, TERMINAL_CODES } from "@/types/terminal";
import type { DB } from "@/types/db";
import { cn } from "@/lib/utils";

interface Props {
  db: DB;
  filters: ReportFilters;
  onChange: (f: ReportFilters) => void;
  supported: FilterKey[];
  /** Optional download control shown next to Reset */
  downloadSlot?: ReactNode;
}

function presets() {
  const today = demoToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const prev = (() => {
    const d = addDays(monthStart, -1);
    return monthRange(d.slice(0, 7));
  })();
  return [
    { key: "mtd", label: "Month to date", from: monthStart, to: today },
    { key: "7", label: "Last 7 days", from: addDays(today, -6), to: today },
    { key: "30", label: "Last 30 operational days", from: addDays(today, -29), to: today },
    { key: "prev", label: "Previous month", from: prev.from, to: prev.to },
    { key: "90", label: "Last 90 days", from: addDays(today, -89), to: today },
  ];
}

export function ReportFiltersBar({ db, filters, onChange, supported, downloadSlot }: Props) {
  const set = <K extends keyof ReportFilters>(k: K, v: ReportFilters[K]) => onChange({ ...filters, [k]: v });
  const on = (k: FilterKey) => supported.includes(k);
  const invalid = !!filters.from && !!filters.to && filters.from > filters.to;
  const ps = presets();
  const hint = (k: FilterKey) => (on(k) ? undefined : "Not used by this report");
  const dis = (k: FilterKey) => !on(k);

  return (
    <SectionCard
      title="Filters"
      description="Dates are operational days (07:00 → 07:00), not calendar timestamps"
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => onChange(defaultFilters())}>
            <RotateCcw /> Reset
          </Button>
          {downloadSlot}
        </>
      }
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {ps.map((p) => {
          const active = filters.from === p.from && filters.to === p.to;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange({ ...filters, from: p.from, to: p.to })}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition",
                active ? "border-brand bg-brand/10 text-brand" : "bg-card text-slate hover:border-brand/40 hover:text-ink",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <Field label="From (op. day)" error={invalid ? "Start is after end" : undefined} className="xl:col-span-1">
          <Input type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} aria-invalid={invalid} aria-label="From date" />
        </Field>
        <Field label="To (op. day)">
          <Input type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} aria-invalid={invalid} aria-label="To date" />
        </Field>
        <Field label="Terminal" hint={hint("terminal")}>
          <NativeSelect value={filters.terminal} onValueChange={(v) => set("terminal", v as ReportFilters["terminal"])} placeholder="All terminals" options={TERMINAL_CODES.slice()} disabled={dis("terminal")} aria-label="Terminal" />
        </Field>
        <Field label="Driver" hint={hint("driverId")}>
          <NativeSelect value={filters.driverId} onValueChange={(v) => set("driverId", v)} placeholder="All drivers" options={db.drivers.map((d) => ({ value: d.id, label: `${d.id} · ${d.name}` }))} disabled={dis("driverId")} aria-label="Driver" />
        </Field>
        <Field label="Vehicle" hint={hint("vehicleId")}>
          <NativeSelect value={filters.vehicleId} onValueChange={(v) => set("vehicleId", v)} placeholder="All vehicles" options={db.primeMovers.map((p) => ({ value: p.id, label: `${p.id} · ${p.regNo}` }))} disabled={dis("vehicleId")} aria-label="Vehicle" />
        </Field>
        <Field label="Route" hint={hint("route")}>
          <NativeSelect value={filters.route} onValueChange={(v) => set("route", v)} placeholder="All routes" options={routeOptions(db)} disabled={dis("route")} aria-label="Route" />
        </Field>
        <Field label="Container size" hint={hint("size")}>
          <NativeSelect value={filters.size} onValueChange={(v) => set("size", v as ReportFilters["size"])} placeholder="All sizes" options={CONTAINER_SIZES} disabled={dis("size")} aria-label="Container size" />
        </Field>
        <Field label="Movement status" hint={hint("status")}>
          <NativeSelect value={filters.status} onValueChange={(v) => set("status", v as ReportFilters["status"])} placeholder="All statuses" options={MOVEMENT_STATUSES.slice()} disabled={dis("status")} aria-label="Movement status" />
        </Field>
      </div>
    </SectionCard>
  );
}
