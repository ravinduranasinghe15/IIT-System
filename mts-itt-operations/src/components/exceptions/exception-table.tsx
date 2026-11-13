"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAuth } from "@/contexts/auth-context";
import { useExceptions } from "@/hooks/use-exceptions";
import { formatDateTime } from "@/lib/date-utils";
import type { ExceptionRecord } from "@/types/exception";

const PRIORITY_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 } as const;

export function ExceptionTable({ rows, emptyAction }: { rows: ExceptionRecord[]; emptyAction?: React.ReactNode }) {
  const router = useRouter();
  const { can } = useAuth();
  const { review } = useExceptions();

  const columns: Column<ExceptionRecord>[] = [
    {
      key: "id",
      header: "Exception ID",
      sortValue: (e) => e.id,
      cell: (e) => (
        <Link href={`/exceptions/${e.id}`} className="font-medium text-brand hover:underline" onClick={(ev) => ev.stopPropagation()}>
          {e.id}
        </Link>
      ),
    },
    {
      key: "movement",
      header: "Movement ID",
      sortValue: (e) => e.movementId,
      cell: (e) => (
        <Link href={`/movements/${e.movementId}`} className="text-brand hover:underline" onClick={(ev) => ev.stopPropagation()}>
          {e.movementId}
        </Link>
      ),
    },
    { key: "container", header: "Container", sortValue: (e) => e.containerNo, cell: (e) => <span className="font-mono text-xs">{e.containerNo}</span> },
    { key: "type", header: "Type", sortValue: (e) => e.type, cell: (e) => <span className="whitespace-nowrap">{e.type}</span> },
    { key: "terminal", header: "Source", sortValue: (e) => e.sourceTerminal, cell: (e) => e.sourceTerminal },
    { key: "priority", header: "Priority", sortValue: (e) => PRIORITY_ORDER[e.priority], cell: (e) => <StatusBadge status={e.priority} /> },
    { key: "reported", header: "Date Reported", sortValue: (e) => e.reportedAt, cell: (e) => <span className="whitespace-nowrap text-xs">{formatDateTime(e.reportedAt)}</span> },
    { key: "assignee", header: "Assigned To", sortValue: (e) => e.assignedTo ?? "", cell: (e) => <span className="whitespace-nowrap">{e.assignedTo ?? <span className="text-slate">Unassigned</span>}</span> },
    {
      key: "status",
      header: "Status",
      sortValue: (e) => e.status,
      cell: (e) => (
        <div className="flex flex-col items-start gap-0.5">
          <StatusBadge status={e.status} />
          {e.status === "Resolved" && e.materialCorrection && e.managerApproved === false && <span className="text-[11px] text-amber-700">Awaiting approval</span>}
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (e) => (
        <div className="flex justify-end gap-1" onClick={(ev) => ev.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" render={<Link href={`/exceptions/${e.id}`} />} aria-label={`View ${e.id}`}>
            <Eye />
          </Button>
          {can("exception.review") && e.status === "Open" && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Start review ${e.id}`}
              title="Start review"
              onClick={() => {
                const r = review(e.id);
                if (r.ok) toast.success(`${e.id} moved to review`);
                else toast.error(r.error);
              }}
            >
              <PlayCircle />
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
      getRowId={(e) => e.id}
      onRowClick={(e) => router.push(`/exceptions/${e.id}`)}
      initialSort={{ key: "reported", dir: "desc" }}
      emptyTitle="No exceptions match"
      emptyDescription="Adjust the filters, or run evidence reconciliation to scan for missing chits."
      emptyAction={emptyAction}
    />
  );
}
