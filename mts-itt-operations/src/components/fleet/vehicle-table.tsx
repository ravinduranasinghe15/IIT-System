"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, MoreHorizontal, Pencil, Wrench } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect } from "@/components/shared/native-select";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useLookups } from "@/hooks/use-lookups";
import { downloadCsv } from "@/lib/export-utils";
import { serviceStatusOf, daysToService } from "@/lib/fleet-utils";
import { formatDate, realToday } from "@/lib/date-utils";
import { driverOnTruck } from "@/lib/roster-rules";
import type { PrimeMover } from "@/types/vehicle";
import { ServiceLogDialog, VehicleEditDialog } from "./vehicle-dialogs";

type Dialog = { kind: "edit" | "service"; vehicle: PrimeMover } | null;

export function VehicleTable() {
  const { db } = useApp();
  const { can } = useAuth();
  const router = useRouter();
  const look = useLookups();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [service, setService] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const manage = can("fleet.manage");

  const movementCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const mv of db.movements) if (mv.primeMoverId) m.set(mv.primeMoverId, (m.get(mv.primeMoverId) ?? 0) + 1);
    return m;
  }, [db.movements]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.primeMovers.filter((v) => {
      if (status && v.status !== status) return false;
      if (service && serviceStatusOf(v.nextServiceDate) !== service) return false;
      if (!s) return true;
      return [v.id, v.regNo, v.make, v.model, v.trailerId ?? ""].some((x) => x.toLowerCase().includes(s));
    });
  }, [db.primeMovers, q, status, service]);

  const columns: Column<PrimeMover>[] = [
    { key: "id", header: "Vehicle ID", sortValue: (v) => v.id, cell: (v) => <span className="font-medium text-navy">{v.id}</span> },
    { key: "reg", header: "Reg No", sortValue: (v) => v.regNo, cell: (v) => <Link href={`/fleet/${v.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink hover:text-brand hover:underline">{v.regNo}</Link> },
    { key: "type", header: "Type", cell: (v) => <div><div>{v.vehicleType}</div><div className="text-xs text-slate">{v.make} {v.model} · {v.year}</div></div> },
    { key: "trailer", header: "Assigned Trailer", sortValue: (v) => v.trailerId ?? "~", cell: (v) => (v.trailerId ? `${v.trailerId} · ${look.trailer(v.trailerId)?.regNo ?? ""}` : <span className="text-slate">None</span>) },
    {
      key: "driver",
      header: "Driver today",
      sortValue: (v) => driverOnTruck(db, v.id, realToday()) ?? "~",
      cell: (v) => {
        const d = driverOnTruck(db, v.id, realToday());
        return d ? (
          <Link href={`/drivers/${d}`} onClick={(e) => e.stopPropagation()} className="hover:text-brand hover:underline">
            {look.driverName(d)}
          </Link>
        ) : (
          <span className="text-slate">Not rostered</span>
        );
      },
    },
    { key: "status", header: "Status", sortValue: (v) => v.status, cell: (v) => <StatusBadge status={v.status} /> },
    { key: "mv", header: "Movements", align: "right", sortValue: (v) => movementCounts.get(v.id) ?? 0, cell: (v) => <span className="tabular-nums">{movementCounts.get(v.id) ?? 0}</span> },
    {
      key: "service",
      header: "Service Status",
      sortValue: (v) => daysToService(v.nextServiceDate) ?? 9999,
      cell: (v) => {
        const st = serviceStatusOf(v.nextServiceDate);
        const left = daysToService(v.nextServiceDate);
        return (
          <div>
            <StatusBadge status={st} />
            <div className="mt-0.5 text-[11px] text-slate">
              {formatDate(v.nextServiceDate)}
              {left !== null && ` (${left < 0 ? `${-left}d overdue` : `in ${left}d`})`}
            </div>
          </div>
        );
      },
    },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (v) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${v.id}`} />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/fleet/${v.id}`)}>
                <Eye /> View details
              </DropdownMenuItem>
              {manage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDialog({ kind: "service", vehicle: v })}>
                    <Wrench /> Add service log
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDialog({ kind: "edit", vehicle: v })}>
                    <Pencil /> Edit vehicle
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search ID, reg no, driver, trailer…" className="w-full sm:w-72" />
        <NativeSelect className="w-40" value={status} onValueChange={setStatus} placeholder="All statuses" options={["Active", "In Maintenance", "Inactive"]} aria-label="Status filter" />
        <NativeSelect className="w-40" value={service} onValueChange={setService} placeholder="All service states" options={["OK", "Due Soon", "Overdue"]} aria-label="Service status filter" />
        {(q || status || service) && (
          <Button variant="ghost" size="sm" onClick={() => { setQ(""); setStatus(""); setService(""); }}>
            Clear
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={!rows.length}
          onClick={() =>
            downloadCsv(
              "fleet",
              rows.map((v) => ({
                "Vehicle ID": v.id,
                "Reg No": v.regNo,
                Type: `${v.make} ${v.model}`,
                Trailer: v.trailerId ?? "",
                "Driver today": look.driverName(driverOnTruck(db, v.id, realToday())),
                Status: v.status,
                Movements: movementCounts.get(v.id) ?? 0,
                "Next Service": v.nextServiceDate,
                "Service Status": serviceStatusOf(v.nextServiceDate),
              })),
            )
          }
        >
          <Download /> Export CSV
        </Button>
      </div>
      <DataTable columns={columns} rows={rows} getRowId={(v) => v.id} onRowClick={(v) => router.push(`/fleet/${v.id}`)} initialSort={{ key: "id", dir: "asc" }} emptyTitle="No vehicles match your filters" />
      {dialog?.kind === "edit" && <VehicleEditDialog vehicle={dialog.vehicle} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog?.kind === "service" && <ServiceLogDialog vehicleId={dialog.vehicle.id} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}
