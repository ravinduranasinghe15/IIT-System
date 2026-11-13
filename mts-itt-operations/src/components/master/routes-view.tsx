"use client";

import { useMemo, useState } from "react";
import { ArrowRight, Pencil, Power, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { setRouteStatus } from "@/lib/mutations/master";
import type { RouteRecord } from "@/types/terminal";
import { MasterShell } from "./master-shell";
import { RouteFormDialog } from "./route-form-dialog";

export function RoutesView() {
  const { db, update } = useApp();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState<{ open: boolean; route: RouteRecord | null }>({ open: false, route: null });
  const [deactivate, setDeactivate] = useState<RouteRecord | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.routes.filter((r) => (!status || r.status === status) && (!s || `${r.id} ${r.code} ${r.source} ${r.destination} ${r.description}`.toLowerCase().includes(s)));
  }, [db.routes, q, status]);

  const usage = (r: RouteRecord) => db.movements.filter((m) => m.sourceTerminal === r.source && m.destinationTerminal === r.destination).length;

  const columns: Column<RouteRecord>[] = [
    { key: "id", header: "ID", cell: (r) => <span className="text-slate">{r.id}</span>, sortValue: (r) => r.id },
    { key: "code", header: "Route code", cell: (r) => <span className="font-semibold text-navy">{r.code}</span>, sortValue: (r) => r.code },
    {
      key: "pair",
      header: "Source → Destination",
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          {r.source} <ArrowRight className="size-3.5 text-slate" /> {r.destination}
        </span>
      ),
      sortValue: (r) => `${r.source}${r.destination}`,
    },
    { key: "desc", header: "Description", className: "min-w-64 whitespace-normal text-slate", cell: (r) => r.description },
    { key: "mv", header: "Movements", align: "right", cell: (r) => usage(r), sortValue: (r) => usage(r) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} />, sortValue: (r) => r.status },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setForm({ open: true, route: r })}>
            <Pencil /> Edit
          </Button>
          {r.status === "Inactive" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                update((d) => setRouteStatus(d, r.id, "Active"));
                toast.success(`Route ${r.code} reactivated`);
              }}
            >
              <RotateCcw /> Reactivate
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setDeactivate(r)}>
              <Power /> Deactivate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <MasterShell
      title="Routes"
      description="Valid source-destination pairs. Movement registration and invoicing only accept active routes. Duplicate pairs are prevented."
      addLabel="Add route"
      onAdd={() => setForm({ open: true, route: null })}
      search={q}
      onSearch={setQ}
      searchPlaceholder="Search routes…"
      filters={<NativeSelect className="w-40" value={status} onValueChange={setStatus} placeholder="All statuses" options={["Active", "Conditional", "Inactive"]} aria-label="Status filter" />}
    >
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} hidePagerIfSinglePage />
      <RouteFormDialog open={form.open} route={form.route} onClose={() => setForm({ open: false, route: null })} />
      <ConfirmDialog
        open={!!deactivate}
        onOpenChange={(o) => !o && setDeactivate(null)}
        title={`Deactivate route ${deactivate?.code ?? ""}?`}
        description="The route will no longer be offered for new movements or invoices. Existing movements and history are preserved."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => {
          if (!deactivate) return;
          update((d) => setRouteStatus(d, deactivate.id, "Inactive"));
          toast.success(`Route ${deactivate.code} deactivated`);
        }}
      />
    </MasterShell>
  );
}
