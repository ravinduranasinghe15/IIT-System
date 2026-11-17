"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAuth } from "@/contexts/auth-context";
import { useLookups } from "@/hooks/use-lookups";
import type { MovementRow } from "@/hooks/use-movements";
import { formatDate, formatTime } from "@/lib/date-utils";
import type { Movement } from "@/types/movement";

export function MovementTable({ rows, onEdit, emptyAction }: { rows: MovementRow[]; onEdit?: (m: Movement) => void; emptyAction?: React.ReactNode }) {
  const router = useRouter();
  const lk = useLookups();
  const { can, canSeeFinancials } = useAuth();
  const canEdit = can("movement.edit");

  const columns: Column<MovementRow>[] = [
    {
      key: "id",
      header: "Movement ID",
      sortValue: (r) => r.movement.id,
      cell: (r) => (
        <Link href={`/movements/${r.movement.id}`} className="font-medium text-brand hover:underline" onClick={(e) => e.stopPropagation()}>
          {r.movement.id}
        </Link>
      ),
    },
    {
      key: "containers",
      header: "Container No(s)",
      sortValue: (r) => r.movement.containerNos[0],
      cell: (r) => (
        <div className="font-mono text-xs leading-tight">
          {r.movement.containerNos.map((c) => (
            <div key={c}>{c}</div>
          ))}
          {r.movement.containerNos.length > 1 && <span className="font-sans text-[11px] text-slate">1 journey · {r.movement.containerNos.length} units</span>}
        </div>
      ),
    },
    { key: "size", header: "Size", sortValue: (r) => r.movement.containerSize, cell: (r) => r.movement.containerSize },
    { key: "source", header: "Source", sortValue: (r) => r.movement.sourceTerminal, cell: (r) => r.movement.sourceTerminal },
    { key: "dest", header: "Destination", sortValue: (r) => r.movement.destinationTerminal, cell: (r) => r.movement.destinationTerminal },
    { key: "pm", header: "Prime Mover", sortValue: (r) => r.movement.primeMoverId, cell: (r) => lk.pmReg(r.movement.primeMoverId) },
    { key: "trailer", header: "Trailer", sortValue: (r) => r.movement.trailerId, cell: (r) => lk.trailerLabel(r.movement.trailerId) },
    { key: "driver", header: "Driver", sortValue: (r) => lk.driverName(r.movement.driverId), cell: (r) => <span className="whitespace-nowrap">{lk.driverName(r.movement.driverId)}</span> },
    { key: "date", header: "Date", sortValue: (r) => r.movement.loadingAt ?? r.movement.dischargeAt, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.movement.loadingAt ?? r.movement.dischargeAt)}</span> },
    { key: "time", header: "Time", cell: (r) => formatTime(r.movement.loadingAt ?? r.movement.dischargeAt) },
    { key: "status", header: "Status", sortValue: (r) => r.movement.status, cell: (r) => <StatusBadge status={r.movement.status} /> },
    ...(canSeeFinancials
      ? [{ key: "billable", header: "Billable Status", sortValue: (r: MovementRow) => r.billable, cell: (r: MovementRow) => <StatusBadge status={r.billable} /> } satisfies Column<MovementRow>]
      : []),
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" render={<Link href={`/movements/${r.movement.id}`} />} aria-label={`View ${r.movement.id}`}>
            <Eye />
          </Button>
          {canEdit && onEdit && (
            <Button variant="ghost" size="icon-sm" onClick={() => onEdit(r.movement)} aria-label={`Edit ${r.movement.id}`}>
              <Pencil />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={rows}
      getRowId={(r) => r.movement.id}
      onRowClick={(r) => router.push(`/movements/${r.movement.id}`)}
      initialSort={{ key: "id", dir: "asc" }}
      emptyTitle="No movements match"
      emptyDescription="Adjust the filters or register a new movement."
      emptyAction={emptyAction}
    />
  );
}
