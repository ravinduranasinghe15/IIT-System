"use client";

import { useMemo, useState } from "react";
import { Pencil, Power, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { useLookups } from "@/hooks/use-lookups";
import { setPrimeMoverStatus } from "@/lib/mutations/master";
import { formatDate } from "@/lib/date-utils";
import type { PrimeMover } from "@/types/vehicle";
import { MasterShell } from "./master-shell";
import { VehicleFormDialog } from "./vehicle-form-dialog";

export function VehiclesView() {
  const { db, update } = useApp();
  const lk = useLookups();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState<{ open: boolean; vehicle: PrimeMover | null }>({ open: false, vehicle: null });
  const [deactivate, setDeactivate] = useState<PrimeMover | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.primeMovers.filter(
      (p) =>
        (!status || p.status === status) &&
        (!s || `${p.id} ${p.regNo} ${p.make} ${p.model} ${p.trailerId ?? ""} ${lk.driverName(p.driverId)}`.toLowerCase().includes(s)),
    );
  }, [db.primeMovers, q, status, lk]);

  const columns: Column<PrimeMover>[] = [
    { key: "id", header: "ID", cell: (p) => <span className="font-semibold text-navy">{p.id}</span>, sortValue: (p) => p.id },
    { key: "reg", header: "Registration", cell: (p) => p.regNo, sortValue: (p) => p.regNo },
    { key: "mm", header: "Make / model", cell: (p) => `${p.make} ${p.model}`, sortValue: (p) => `${p.make} ${p.model}` },
    { key: "year", header: "Year", align: "right", cell: (p) => p.year, sortValue: (p) => p.year },
    { key: "type", header: "Type", className: "text-slate", cell: (p) => p.vehicleType },
    { key: "trailer", header: "Trailer", cell: (p) => (p.trailerId ? `${p.trailerId} · ${lk.trailer(p.trailerId)?.regNo ?? ""}` : <span className="text-slate">Unassigned</span>) },
    { key: "driver", header: "Driver", cell: (p) => (p.driverId ? lk.driverName(p.driverId) : <span className="text-slate">Unassigned</span>), sortValue: (p) => lk.driverName(p.driverId) },
    { key: "svc", header: "Next service", cell: (p) => formatDate(p.nextServiceDate), sortValue: (p) => p.nextServiceDate },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} />, sortValue: (p) => p.status },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (p) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setForm({ open: true, vehicle: p })}>
            <Pencil /> Edit
          </Button>
          {p.status === "Inactive" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                update((d) => setPrimeMoverStatus(d, p.id, "Active"));
                toast.success(`${p.id} reactivated`);
              }}
            >
              <RotateCcw /> Reactivate
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setDeactivate(p)}>
              <Power /> Deactivate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <MasterShell
      title="Prime movers"
      description="Fleet register. Trailer and driver assignments update the linked Trailer and Driver records. Fleet size and driver allocation are unconfirmed and configurable."
      addLabel="Add prime mover"
      onAdd={() => setForm({ open: true, vehicle: null })}
      search={q}
      onSearch={setQ}
      searchPlaceholder="Search ID, reg, make, driver…"
      filters={<NativeSelect className="w-44" value={status} onValueChange={setStatus} placeholder="All statuses" options={["Active", "In Maintenance", "Inactive"]} aria-label="Status filter" />}
    >
      <DataTable columns={columns} rows={rows} getRowId={(p) => p.id} />
      <VehicleFormDialog open={form.open} vehicle={form.vehicle} onClose={() => setForm({ open: false, vehicle: null })} />
      <ConfirmDialog
        open={!!deactivate}
        onOpenChange={(o) => !o && setDeactivate(null)}
        title={`Deactivate ${deactivate?.id ?? "prime mover"}?`}
        description="The vehicle is marked Inactive and will count as inactive in fleet utilisation. Assignments and history are preserved."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => {
          if (!deactivate) return;
          update((d) => setPrimeMoverStatus(d, deactivate.id, "Inactive"));
          toast.success(`${deactivate.id} deactivated`);
        }}
      />
    </MasterShell>
  );
}
