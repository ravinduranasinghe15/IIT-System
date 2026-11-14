"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, MoreHorizontal, Pencil, Truck, UserCog } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect } from "@/components/shared/native-select";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useDriverStats } from "@/hooks/use-drivers";
import { downloadCsv } from "@/lib/export-utils";
import { formatDate, demoToday, daysBetween } from "@/lib/date-utils";
import type { Driver } from "@/types/driver";
import { AssignPrimeMoverDialog, DriverStatusDialog, EditDriverDialog } from "./driver-dialogs";

type Dialog = { kind: "edit" | "assign" | "status"; driver: Driver } | null;

export function DriverTable() {
  const { db } = useApp();
  const { can } = useAuth();
  const router = useRouter();
  const stats = useDriverStats();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [shift, setShift] = useState("");
  const [assigned, setAssigned] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const manage = can("driver.manage");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.drivers.filter((d) => {
      if (status && d.status !== status) return false;
      if (shift && d.shift !== shift) return false;
      if (assigned === "yes" && !d.primeMoverId) return false;
      if (assigned === "no" && d.primeMoverId) return false;
      if (!s) return true;
      return [d.id, d.name, d.phone, d.licenseNo, d.primeMoverId ?? ""].some((v) => v.toLowerCase().includes(s));
    });
  }, [db.drivers, q, status, shift, assigned]);

  const columns: Column<Driver>[] = [
    { key: "id", header: "Driver ID", sortValue: (d) => d.id, cell: (d) => <span className="font-medium text-navy">{d.id}</span> },
    {
      key: "name",
      header: "Name",
      sortValue: (d) => d.name,
      cell: (d) => (
        <Link href={`/drivers/${d.id}`} className="font-medium text-ink hover:text-brand hover:underline" onClick={(e) => e.stopPropagation()}>
          {d.name}
        </Link>
      ),
    },
    { key: "phone", header: "Contact", cell: (d) => <span className="whitespace-nowrap text-slate">{d.phone}</span> },
    {
      key: "pm",
      header: "Prime Mover",
      sortValue: (d) => d.primeMoverId ?? "~",
      cell: (d) =>
        d.primeMoverId ? (
          <Link href={`/fleet/${d.primeMoverId}`} className="text-brand hover:underline" onClick={(e) => e.stopPropagation()}>
            {d.primeMoverId}
          </Link>
        ) : (
          <span className="text-slate">Unassigned</span>
        ),
    },
    {
      key: "license",
      header: "Licence No",
      sortValue: (d) => d.licenseNo,
      cell: (d) => {
        const left = daysBetween(demoToday(), d.licenseExpiry);
        return (
          <div className="whitespace-nowrap">
            {d.licenseNo}
            <div className={left < 0 ? "text-xs text-danger" : left < 90 ? "text-xs text-amber-600" : "text-xs text-slate"}>
              {left < 0 ? "Expired " : "Exp. "}
              {formatDate(d.licenseExpiry)}
            </div>
          </div>
        );
      },
    },
    { key: "status", header: "Status", sortValue: (d) => d.status, cell: (d) => <StatusBadge status={d.status} /> },
    { key: "shift", header: "Shift", sortValue: (d) => d.shift, cell: (d) => <StatusBadge status={d.shift} /> },
    {
      key: "movements",
      header: "Movements",
      align: "right",
      sortValue: (d) => stats.get(d.id)?.total ?? 0,
      cell: (d) => <span className="tabular-nums">{stats.get(d.id)?.total ?? 0}</span>,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (d) => (
        <div onClick={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${d.name}`} />}>
              <MoreHorizontal />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => router.push(`/drivers/${d.id}`)}>
                <Eye /> View profile
              </DropdownMenuItem>
              {manage && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDialog({ kind: "edit", driver: d })}>
                    <Pencil /> Edit details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDialog({ kind: "assign", driver: d })}>
                    <Truck /> Assign prime mover
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setDialog({ kind: "status", driver: d })}>
                    <UserCog /> Update status
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const exportRows = () =>
    downloadCsv(
      "drivers",
      rows.map((d) => ({
        "Driver ID": d.id,
        Name: d.name,
        Contact: d.phone,
        "Prime Mover": d.primeMoverId ?? "",
        "Licence No": d.licenseNo,
        "Licence Expiry": d.licenseExpiry,
        Status: d.status,
        Shift: d.shift,
        "Total Movements": stats.get(d.id)?.total ?? 0,
      })),
    );

  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b p-3">
        <SearchInput value={q} onChange={setQ} placeholder="Search name, ID, licence, prime mover…" className="w-full sm:w-72" />
        <NativeSelect className="w-36" value={status} onValueChange={setStatus} placeholder="All statuses" options={["Active", "On Leave", "Suspended", "Inactive"]} aria-label="Status filter" />
        <NativeSelect className="w-36" value={shift} onValueChange={setShift} placeholder="All shifts" options={["Morning", "Afternoon", "Night", "Rotating"]} aria-label="Shift filter" />
        <NativeSelect
          className="w-44"
          value={assigned}
          onValueChange={setAssigned}
          placeholder="Any assignment"
          options={[
            { value: "yes", label: "Has prime mover" },
            { value: "no", label: "No prime mover" },
          ]}
          aria-label="Assignment filter"
        />
        {(q || status || shift || assigned) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ("");
              setStatus("");
              setShift("");
              setAssigned("");
            }}
          >
            Clear
          </Button>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={exportRows} disabled={!rows.length}>
          <Download /> Export CSV
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(d) => d.id}
        onRowClick={(d) => router.push(`/drivers/${d.id}`)}
        initialSort={{ key: "id", dir: "asc" }}
        emptyTitle="No drivers match your filters"
        emptyDescription="Adjust the search or filters, or register a new driver."
      />
      {dialog?.kind === "edit" && <EditDriverDialog driver={dialog.driver} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog?.kind === "assign" && <AssignPrimeMoverDialog driver={dialog.driver} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog?.kind === "status" && <DriverStatusDialog driver={dialog.driver} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}
