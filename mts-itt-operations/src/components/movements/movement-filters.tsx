"use client";

import { FilterX } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { EMPTY_FILTERS, type MovementFilters } from "@/hooks/use-movements";
import { MOVEMENT_STATUSES } from "@/types/movement";
import { TERMINAL_CODES } from "@/types/terminal";

const BILLABLE = ["Billable", "Blocked – Exception", "Pending Approval", "Pending Chits", "Pending Driver Log", "Pending Completion", "Non-billable"];

export function MovementFiltersBar({ filters, onChange }: { filters: MovementFilters; onChange: (f: MovementFilters) => void }) {
  const { db } = useApp();
  const { isDriver, canSeeFinancials } = useAuth();
  const set = <K extends keyof MovementFilters>(k: K, v: MovementFilters[K]) => onChange({ ...filters, [k]: v });
  const active = (Object.keys(filters) as (keyof MovementFilters)[]).some((k) => filters[k] !== EMPTY_FILTERS[k]);

  return (
    <div className="flex flex-wrap items-end gap-2 border-b p-3">
      <SearchInput value={filters.search} onChange={(v) => set("search", v)} placeholder="Search movement ID or container no…" className="w-full sm:w-64" />
      <NativeSelect className="w-32" value={filters.terminal} onValueChange={(v) => set("terminal", v)} placeholder="Terminal" options={TERMINAL_CODES} aria-label="Terminal" />
      {!isDriver && (
        <NativeSelect
          className="w-44"
          value={filters.driver}
          onValueChange={(v) => set("driver", v)}
          placeholder="All drivers"
          options={db.drivers.map((d) => ({ value: d.id, label: d.name }))}
          aria-label="Driver"
        />
      )}
      <NativeSelect
        className="w-32"
        value={filters.truck}
        onValueChange={(v) => set("truck", v)}
        placeholder="All trucks"
        options={db.primeMovers.map((p) => ({ value: p.id, label: p.id }))}
        aria-label="Truck"
      />
      <NativeSelect className="w-28" value={filters.size} onValueChange={(v) => set("size", v)} placeholder="Any size" options={["20FT", "40FT"]} aria-label="Size" />
      <NativeSelect className="w-36" value={filters.status} onValueChange={(v) => set("status", v)} placeholder="All statuses" options={MOVEMENT_STATUSES} aria-label="Status" />
      {canSeeFinancials && (
        <NativeSelect className="w-48" value={filters.billable} onValueChange={(v) => set("billable", v)} placeholder="All billable states" options={BILLABLE} aria-label="Billable status" />
      )}
      <div className="flex items-center gap-1.5 text-xs text-slate">
        <span>From</span>
        <Input type="date" className="h-8 w-36" value={filters.from} onChange={(e) => set("from", e.target.value)} aria-label="From operational day" />
        <span>To</span>
        <Input type="date" className="h-8 w-36" value={filters.to} onChange={(e) => set("to", e.target.value)} aria-label="To operational day" />
      </div>
      {active && (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_FILTERS)}>
          <FilterX /> Clear
        </Button>
      )}
    </div>
  );
}
