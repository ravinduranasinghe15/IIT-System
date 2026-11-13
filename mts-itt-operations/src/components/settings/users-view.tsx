"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Power, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect } from "@/components/shared/native-select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useLookups } from "@/hooks/use-lookups";
import { ROLE_DESCRIPTIONS } from "@/lib/permissions";
import { setUserStatus } from "@/lib/mutations/settings";
import { formatDateTime } from "@/lib/date-utils";
import { ROLES, type AppUser } from "@/types/user";
import { AdminGuard } from "./admin-guard";
import { UserFormDialog } from "./user-form-dialog";

export function UsersView() {
  return (
    <AdminGuard>
      <UsersInner />
    </AdminGuard>
  );
}

function UsersInner() {
  const { db, update } = useApp();
  const { user: me } = useAuth();
  const lk = useLookups();
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [form, setForm] = useState<{ open: boolean; user: AppUser | null }>({ open: false, user: null });
  const [disable, setDisable] = useState<AppUser | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.users.filter((u) => (!role || u.role === role) && (!status || u.status === status) && (!s || `${u.id} ${u.name} ${u.email} ${u.role}`.toLowerCase().includes(s)));
  }, [db.users, q, role, status]);

  const columns: Column<AppUser>[] = [
    { key: "id", header: "ID", cell: (u) => <span className="text-slate">{u.id}</span>, sortValue: (u) => u.id },
    {
      key: "name",
      header: "Name",
      cell: (u) => (
        <div>
          <div className="font-medium text-ink">
            {u.name}
            {u.id === me.id && <span className="ml-1.5 rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand">You</span>}
          </div>
          <div className="text-xs text-slate">{u.email}</div>
        </div>
      ),
      sortValue: (u) => u.name,
    },
    { key: "role", header: "Role", cell: (u) => u.role, sortValue: (u) => u.role },
    { key: "desc", header: "Access", className: "min-w-64 max-w-sm whitespace-normal text-xs text-slate", cell: (u) => ROLE_DESCRIPTIONS[u.role] },
    { key: "driver", header: "Linked driver", cell: (u) => (u.driverId ? `${u.driverId} · ${lk.driverName(u.driverId)}` : <span className="text-slate">—</span>) },
    { key: "login", header: "Last login", cell: (u) => formatDateTime(u.lastLogin), sortValue: (u) => u.lastLogin ?? "" },
    { key: "status", header: "Status", cell: (u) => <StatusBadge status={u.status} />, sortValue: (u) => u.status },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (u) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setForm({ open: true, user: u })}>
            <Pencil /> Edit
          </Button>
          {u.status === "Active" ? (
            <Button variant="ghost" size="sm" className="text-danger hover:text-danger" onClick={() => setDisable(u)}>
              <Power /> Disable
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                update((d) => setUserStatus(d, u.id, "Active"));
                toast.success(`${u.name} enabled`);
              }}
            >
              <RotateCcw /> Enable
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="User management"
        description="Demo accounts for the six roles. The header role switcher signs in as the first active user of a role. Frontend demo only – no real authentication."
        actions={
          <Button size="sm" onClick={() => setForm({ open: true, user: null })}>
            <Plus /> Create user
          </Button>
        }
      />
      <SectionCard
        bodyClassName="p-0"
        title={
          <div className="flex flex-wrap items-center gap-2 py-0.5 font-normal">
            <SearchInput value={q} onChange={setQ} placeholder="Search name, email…" className="w-64" />
            <NativeSelect className="w-48" value={role} onValueChange={setRole} placeholder="All roles" options={[...ROLES]} aria-label="Role filter" />
            <NativeSelect className="w-36" value={status} onValueChange={setStatus} placeholder="All statuses" options={["Active", "Disabled"]} aria-label="Status filter" />
          </div>
        }
      >
        <DataTable columns={columns} rows={rows} getRowId={(u) => u.id} />
      </SectionCard>
      <UserFormDialog open={form.open} user={form.user} onClose={() => setForm({ open: false, user: null })} />
      <ConfirmDialog
        open={!!disable}
        onOpenChange={(o) => !o && setDisable(null)}
        title={`Disable ${disable?.name ?? "user"}?`}
        description="The user can no longer be selected as an active demo session. Their history is preserved and they can be re-enabled."
        confirmLabel="Disable user"
        destructive
        onConfirm={() => {
          if (!disable) return;
          const res = update((d) => setUserStatus(d, disable.id, "Disabled"));
          if (res.ok) toast.success(`${disable.name} disabled`);
          else toast.error(res.error);
        }}
      />
    </div>
  );
}
