"use client";

import { useMemo, useState } from "react";
import { Download, FilterX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { downloadCsv } from "@/lib/export-utils";
import { formatDateTime } from "@/lib/date-utils";
import type { AuditLog } from "@/types/user";
import { History, Layers, Users, Banknote } from "lucide-react";
import { AdminGuard } from "./admin-guard";

export function AuditLogsView() {
  return (
    <AdminGuard>
      <AuditInner />
    </AdminGuard>
  );
}

function AuditInner() {
  const { db } = useApp();
  const [q, setQ] = useState("");
  const [mod, setMod] = useState("");
  const [user, setUser] = useState("");
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [financial, setFinancial] = useState(false);

  const modules = useMemo(() => [...new Set(db.audit.map((a) => a.module))].sort(), [db.audit]);
  const users = useMemo(() => [...new Set(db.audit.map((a) => a.userName))].sort(), [db.audit]);
  const actions = useMemo(() => [...new Set(db.audit.map((a) => a.action))].sort(), [db.audit]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.audit.filter(
      (a) =>
        (!mod || a.module === mod) &&
        (!user || a.userName === user) &&
        (!action || a.action === action) &&
        (!from || a.at.slice(0, 10) >= from) &&
        (!to || a.at.slice(0, 10) <= to) &&
        (!financial || a.financial) &&
        (!s || `${a.id} ${a.userName} ${a.action} ${a.module} ${a.description} ${a.entityId ?? ""}`.toLowerCase().includes(s)),
    );
  }, [db.audit, q, mod, user, action, from, to, financial]);

  const filtered = !!(q || mod || user || action || from || to || financial);
  const clear = () => {
    setQ("");
    setMod("");
    setUser("");
    setAction("");
    setFrom("");
    setTo("");
    setFinancial(false);
  };

  const exportCsv = () => {
    downloadCsv(
      "audit-logs",
      rows.map((a) => ({
        "Activity ID": a.id,
        User: a.userName,
        Role: a.role,
        Action: a.action,
        Module: a.module,
        "Date/Time": a.at.replace("T", " "),
        Entity: a.entityId ?? "",
        Financial: a.financial ? "Yes" : "No",
        Description: a.description,
      })),
    );
    toast.success(`Exported ${rows.length} audit entries`);
  };

  const columns: Column<AuditLog>[] = [
    { key: "id", header: "Activity ID", cell: (a) => <span className="font-medium text-navy">{a.id}</span>, sortValue: (a) => a.id },
    {
      key: "user",
      header: "User",
      cell: (a) => (
        <div>
          <div className="text-ink">{a.userName}</div>
          <div className="text-xs text-slate">{a.role}</div>
        </div>
      ),
      sortValue: (a) => a.userName,
    },
    {
      key: "action",
      header: "Action",
      cell: (a) => (
        <span className="inline-flex items-center gap-1.5">
          {a.action}
          {a.financial && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 ring-1 ring-inset ring-amber-600/20">Financial</span>}
        </span>
      ),
      sortValue: (a) => a.action,
    },
    { key: "module", header: "Module", cell: (a) => a.module, sortValue: (a) => a.module },
    { key: "at", header: "Date / time", cell: (a) => <span className="whitespace-nowrap">{formatDateTime(a.at)}</span>, sortValue: (a) => a.at },
    { key: "desc", header: "Description", className: "min-w-80 whitespace-normal text-slate", cell: (a) => a.description },
  ];

  return (
    <div>
      <PageHeader
        title="Audit logs"
        description="Every master-data change, correction, approval and settings update recorded in the demo, including financially material events."
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download /> Export CSV
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total activities" value={db.audit.length} icon={History} tone="navy" />
        <StatCard label="Financial events" value={db.audit.filter((a) => a.financial).length} icon={Banknote} tone="orange" />
        <StatCard label="Modules" value={modules.length} icon={Layers} tone="blue" />
        <StatCard label="Users acting" value={users.length} icon={Users} tone="green" />
      </div>
      <SectionCard
        bodyClassName="p-0"
        title={
          <div className="flex flex-wrap items-center gap-2 py-0.5 font-normal">
            <SearchInput value={q} onChange={setQ} placeholder="Search description, ID, entity…" className="w-64" />
            <NativeSelect className="w-40" value={mod} onValueChange={setMod} placeholder="All modules" options={modules} aria-label="Module filter" />
            <NativeSelect className="w-44" value={user} onValueChange={setUser} placeholder="All users" options={users} aria-label="User filter" />
            <NativeSelect className="w-48" value={action} onValueChange={setAction} placeholder="All actions" options={actions} aria-label="Action filter" />
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-36" aria-label="From date" />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-36" aria-label="To date" />
            <label className="flex items-center gap-2 text-xs text-slate">
              <Switch size="sm" checked={financial} onCheckedChange={setFinancial} aria-label="Financial events only" />
              Financial only
            </label>
            {filtered && (
              <Button variant="ghost" size="sm" onClick={clear}>
                <FilterX /> Clear
              </Button>
            )}
          </div>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(a) => a.id}
          initialSort={{ key: "at", dir: "desc" }}
          emptyTitle="No audit entries match"
          emptyDescription={db.audit.length ? "Try clearing some filters." : "Changes you make in the demo will be recorded here."}
        />
      </SectionCard>
    </div>
  );
}
