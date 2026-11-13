"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/shared/section-card";
import { useAuth } from "@/contexts/auth-context";
import { useLookups } from "@/hooks/use-lookups";
import { EMPTY_FILTERS, filterRows, useMovements, type MovementFilters } from "@/hooks/use-movements";
import { downloadCsv } from "@/lib/export-utils";
import { formatDateTime } from "@/lib/date-utils";
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
      <MovementEditDialog movement={editing} onOpenChange={(o) => !o && setEditing(null)} />
    </div>
  );
}
