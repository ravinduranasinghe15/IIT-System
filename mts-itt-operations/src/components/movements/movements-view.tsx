"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/shared/section-card";
import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect } from "@/components/shared/native-select";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { useAuth } from "@/contexts/auth-context";
import { useLookups } from "@/hooks/use-lookups";
import { EMPTY_FILTERS, filterRows, useMovements, type MovementFilters } from "@/hooks/use-movements";
import { downloadCsv } from "@/lib/export-utils";
import { formatDate, formatDateTime, formatTime } from "@/lib/date-utils";
import { MOVEMENT_STATUSES } from "@/types/movement";
import { containerCount } from "@/lib/stats";
import type { Movement } from "@/types/movement";
import { MovementFiltersBar } from "./movement-filters";
import { MovementTable } from "./movement-table";
import { MovementEditDialog } from "./movement-edit-dialog";
import { toast } from "sonner";

export function MovementsView() {
  const { rows } = useMovements();
  const { can, isDriver, canSeeFinancials } = useAuth();
  const lk = useLookups();
  const [filters, setFilters] = useState<MovementFilters>(EMPTY_FILTERS);
  const [editing, setEditing] = useState<Movement | null>(null);

  const filtered = useMemo(() => filterRows(rows, filters), [rows, filters]);
  const stats = useMemo(() => {
    const ms = filtered.map((r) => r.movement);
    return {
      journeys: ms.length,
      containers: containerCount(ms),
      completed: ms.filter((m) => m.status === "Completed").length,
      attention: ms.filter((m) => ["Under Review", "Rejected", "Damaged"].includes(m.status)).length,
    };
  }, [filtered]);

  const exportCsv = () => {
    downloadCsv(
      "movements",
      filtered.map(({ movement: m, billable }) => ({
        "Movement ID": m.id,
        "Container Numbers": m.containerNos.join(" + "),
        Size: m.containerSize,
        Source: m.sourceTerminal,
        Destination: m.destinationTerminal,
        "Prime Mover": lk.pmReg(m.primeMoverId),
        Trailer: lk.trailerLabel(m.trailerId),
        Driver: lk.driverName(m.driverId),
        Loading: formatDateTime(m.loadingAt),
        Discharge: formatDateTime(m.dischargeAt),
        Status: m.status,
        ...(canSeeFinancials ? { "Billable Status": billable } : {}),
      })),
    );
    toast.success(`Exported ${filtered.length} movement(s) to CSV`);
  };

  return (
    <div>
      <PageHeader
        title={isDriver ? "My Movements" : "Movements"}
        description={
          isDriver
            ? "Your assigned journeys. Financial information is not shown for the Driver role."
            : "Central ledger of inter-terminal journeys. One journey = one 40FT or up to two 20FT containers on one trailer."
        }
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
              <Download /> Export CSV
            </Button>
            {can("movement.create") && (
              <Button render={<Link href="/movements/new" />}>
                <Plus /> Register Movement
              </Button>
            )}
          </>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Journeys" value={stats.journeys} hint="Matching filters" tone="navy" />
        <StatCard label="Container Units" value={stats.containers} hint="Not the same as journeys" tone="blue" />
        <StatCard label="Completed" value={stats.completed} tone="green" />
        <StatCard label="Needs Attention" value={stats.attention} hint="Rejected, damaged, under review" tone="red" />
      </div>
      {isDriver ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <SearchInput value={filters.search} onChange={(v) => setFilters({ ...filters, search: v })} placeholder="Search…" className="col-span-2" />
            <NativeSelect className="col-span-2" value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })} placeholder="All statuses" options={MOVEMENT_STATUSES} aria-label="Status" />
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-xl border bg-card py-4">
              <EmptyState title="No movements" description="No journeys match. Clear the search or status filter." />
            </div>
          ) : (
            <ul className="space-y-2">
              {filtered.map(({ movement: m }) => (
                <li key={m.id}>
                  <Link href={`/movements/${m.id}`} className="block rounded-xl border bg-card p-3 shadow-sm active:bg-muted/50">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-brand">{m.id}</span>
                      <span className="flex items-center gap-1">
                        <StatusBadge status={m.status} />
                        <ChevronRight className="size-4 text-slate" />
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-xs text-ink">{m.containerNos.join(" + ")}</div>
                    <div className="mt-1 text-sm text-ink">
                      {m.sourceTerminal} → {m.destinationTerminal} · {m.containerSize.replace("FT", " ft")}
                    </div>
                    <div className="mt-1 text-xs text-slate">
                      {lk.pmReg(m.primeMoverId)} · {formatDate(m.loadingAt ?? m.dischargeAt)}
                      {m.loadingAt && ` · Loaded ${formatTime(m.loadingAt)}`}
                      {m.dischargeAt && ` · Discharged ${formatTime(m.dischargeAt)}`}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
      <SectionCard bodyClassName="p-0">
        <MovementFiltersBar filters={filters} onChange={setFilters} />
        <MovementTable
          rows={filtered}
          onEdit={setEditing}
          emptyAction={
            rows.length > 0 ? (
              <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      </SectionCard>
      )}
      <MovementEditDialog movement={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
