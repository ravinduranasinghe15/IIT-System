"use client";

import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import type { Terminal } from "@/types/terminal";
import { MasterShell } from "./master-shell";
import { TerminalFormDialog } from "./terminal-form-dialog";

export function TerminalsView() {
  const { db } = useApp();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Terminal | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.terminals.filter((t) => !s || `${t.code} ${t.name} ${t.role} ${t.note}`.toLowerCase().includes(s));
  }, [db.terminals, q]);

  const columns: Column<Terminal>[] = [
    { key: "code", header: "Code", cell: (t) => <span className="font-semibold text-navy">{t.code}</span>, sortValue: (t) => t.code },
    { key: "name", header: "Terminal name", cell: (t) => t.name, sortValue: (t) => t.name },
    { key: "role", header: "Role", cell: (t) => t.role, sortValue: (t) => t.role },
    { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} />, sortValue: (t) => t.status },
    {
      key: "note",
      header: "Note",
      className: "min-w-72 whitespace-normal text-slate",
      cell: (t) => (
        <span>
          {t.note}
          {t.status === "Conditional" && (
            <span className="mt-0.5 block text-xs text-amber-700">Conditional – subject to receiving and validating a usable sample report format.</span>
          )}
        </span>
      ),
    },
    { key: "routes", header: "Routes", align: "right", cell: (t) => db.routes.filter((r) => r.source === t.code || r.destination === t.code).length },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (t) => (
        <Button variant="ghost" size="sm" onClick={() => setEditing(t)}>
          <Pencil /> Edit
        </Button>
      ),
    },
  ];

  return (
    <MasterShell
      title="Terminals"
      description="Port of Colombo terminals used for inter-terminal transport. CICT is conditional pending sample validation; ECT is not operational."
      search={q}
      onSearch={setQ}
      searchPlaceholder="Search terminals…"
    >
      <DataTable columns={columns} rows={rows} getRowId={(t) => t.code} hidePagerIfSinglePage />
      <TerminalFormDialog terminal={editing} onClose={() => setEditing(null)} />
    </MasterShell>
  );
}
