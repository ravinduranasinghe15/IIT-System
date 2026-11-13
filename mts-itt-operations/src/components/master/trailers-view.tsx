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
import { setTrailerStatus } from "@/lib/mutations/master";
import type { Trailer } from "@/types/vehicle";
import { MasterShell } from "./master-shell";
import { TrailerFormDialog } from "./trailer-form-dialog";

export function TrailersView() {
  const { db, update } = useApp();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState<{ open: boolean; trailer: Trailer | null }>({ open: false, trailer: null });
  const [deactivate, setDeactivate] = useState<Trailer | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.trailers.filter((t) => (!status || t.status === status) && (!s || `${t.id} ${t.regNo} ${t.trailerType} ${t.primeMoverId ?? ""}`.toLowerCase().includes(s)));
  }, [db.trailers, q, status]);

  const columns: Column<Trailer>[] = [
    { key: "id", header: "ID", cell: (t) => <span className="font-semibold text-navy">{t.id}</span>, sortValue: (t) => t.id },
    { key: "reg", header: "Registration", cell: (t) => t.regNo, sortValue: (t) => t.regNo },
    { key: "type", header: "Type", cell: (t) => t.trailerType, sortValue: (t) => t.trailerType },
    { key: "cap", header: "Capacity", className: "text-slate", cell: (t) => t.capacity },
    {
      key: "pm",
      header: "Prime mover",
      cell: (t) => (t.primeMoverId ? `${t.primeMoverId} · ${db.primeMovers.find((p) => p.id === t.primeMoverId)?.regNo ?? ""}` : <span className="text-slate">Unassigned</span>),
      sortValue: (t) => t.primeMoverId ?? "",
    },
    { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} />, sortValue: (t) => t.status },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (t) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setForm({ open: true, trailer: t })}>
            <Pencil /> Edit
          </Button>
          {t.status === "Inactive" ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                update((d) => setTrailerStatus(d, t.id, "Active"));
                toast.success(`${t.id} reactivated`);
              }}
            >
              <RotateCcw /> Reactivate
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setDeactivate(t)}>
              <Power /> Deactivate
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <MasterShell
      title="Trailers"
      description="Skeletal trailers (1 x 40FT or 2 x 20FT per journey). Assign a trailer to a prime mover here or from the Prime movers page."
      addLabel="Add trailer"
      onAdd={() => setForm({ open: true, trailer: null })}
      search={q}
      onSearch={setQ}
      searchPlaceholder="Search ID, reg, prime mover…"
      filters={<NativeSelect className="w-44" value={status} onValueChange={setStatus} placeholder="All statuses" options={["Active", "In Maintenance", "Inactive"]} aria-label="Status filter" />}
    >
      <DataTable columns={columns} rows={rows} getRowId={(t) => t.id} />
      <TrailerFormDialog open={form.open} trailer={form.trailer} onClose={() => setForm({ open: false, trailer: null })} />
      <ConfirmDialog
        open={!!deactivate}
        onOpenChange={(o) => !o && setDeactivate(null)}
        title={`Deactivate ${deactivate?.id ?? "trailer"}?`}
        description="The trailer is marked Inactive. Its prime mover link and movement history are preserved."
        confirmLabel="Deactivate"
        destructive
        onConfirm={() => {
          if (!deactivate) return;
          update((d) => setTrailerStatus(d, deactivate.id, "Inactive"));
          toast.success(`${deactivate.id} deactivated`);
        }}
      />
    </MasterShell>
  );
}
