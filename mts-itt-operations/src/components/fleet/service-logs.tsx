"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { formatDate } from "@/lib/date-utils";
import { formatMoney } from "@/lib/utils";
import type { ServiceRecord } from "@/types/vehicle";
import { ServiceLogDialog } from "./vehicle-dialogs";

/** Service records table (add / edit gated by fleet.manage). */
export function ServiceLogs({ vehicleId }: { vehicleId: string }) {
  const { db } = useApp();
  const { can, canSeeFinancials } = useAuth();
  const [dialog, setDialog] = useState<{ record?: ServiceRecord } | null>(null);
  const manage = can("fleet.manage");
  const rows = useMemo(() => db.serviceRecords.filter((s) => s.vehicleId === vehicleId), [db.serviceRecords, vehicleId]);

  const columns: Column<ServiceRecord>[] = [
    { key: "id", header: "Log ID", cell: (s) => <span className="font-medium text-navy">{s.id}</span> },
    { key: "date", header: "Date", sortValue: (s) => s.date, cell: (s) => <span className="whitespace-nowrap">{formatDate(s.date)}</span> },
    { key: "type", header: "Type", sortValue: (s) => s.serviceType, cell: (s) => s.serviceType },
    { key: "desc", header: "Description", cell: (s) => <span className="text-slate">{s.description}</span> },
    ...(canSeeFinancials ? [{ key: "cost", header: "Cost", align: "right" as const, sortValue: (s: ServiceRecord) => s.cost, cell: (s: ServiceRecord) => formatMoney(s.cost, db.settings.currency) }] : []),
    { key: "next", header: "Next service", sortValue: (s) => s.nextServiceDate, cell: (s) => <span className="whitespace-nowrap">{formatDate(s.nextServiceDate)}</span> },
    { key: "status", header: "Status", sortValue: (s) => s.status, cell: (s) => <StatusBadge status={s.status === "Completed" ? "Completed" : s.status === "Overdue" ? "Overdue" : "Scheduled"} /> },
    ...(manage
      ? [
          {
            key: "act",
            header: "",
            align: "right" as const,
            cell: (s: ServiceRecord) => (
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${s.id}`} onClick={() => setDialog({ record: s })}>
                <Pencil />
              </Button>
            ),
          },
        ]
      : []),
  ];

  return (
    <div>
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-navy">Service records</h3>
          <p className="text-xs text-slate">Basic service log – no maintenance automation or claims.</p>
        </div>
        {manage && (
          <Button size="sm" onClick={() => setDialog({})}>
            <Plus /> Add service log
          </Button>
        )}
      </div>
      <DataTable columns={columns} rows={rows} getRowId={(s) => s.id} initialSort={{ key: "date", dir: "desc" }} pageSize={10} hidePagerIfSinglePage emptyTitle="No service records" emptyDescription="Add the first service log for this vehicle." />
      {dialog && <ServiceLogDialog vehicleId={vehicleId} record={dialog.record} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}
