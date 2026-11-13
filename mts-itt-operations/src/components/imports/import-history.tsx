"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AlertTriangle, CopyX, Download, FileSpreadsheet, FileUp, ListChecks, Plus, Rows3 } from "lucide-react";
import type { ImportRecord } from "@/types/import";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { NativeSelect } from "@/components/shared/native-select";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useImportStats } from "@/hooks/use-imports";
import { formatDateTime } from "@/lib/date-utils";
import { SAMPLE_FILES, SOURCE_TERMINALS, TerminalTag } from "./import-common";

const STATUSES = ["Completed", "Completed with Issues", "Rejected – Duplicate File"];

export function ImportHistoryView() {
  const { db } = useApp();
  const { can } = useAuth();
  const router = useRouter();
  const stats = useImportStats();
  const [q, setQ] = useState("");
  const [terminal, setTerminal] = useState("");
  const [status, setStatus] = useState("");
  const canRun = can("import.run");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return db.imports.filter(
      (i) =>
        (!terminal || i.terminal === terminal) &&
        (!status || i.status === status) &&
        (!s || i.id.toLowerCase().includes(s) || i.fileName.toLowerCase().includes(s) || i.uploadedBy.toLowerCase().includes(s)),
    );
  }, [db.imports, q, terminal, status]);

  const columns: Column<ImportRecord>[] = [
    { key: "id", header: "Import ID", sortValue: (r) => r.id, cell: (r) => <Link href={`/terminal-imports/${r.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-brand hover:underline">{r.id}</Link> },
    {
      key: "file",
      header: "File",
      sortValue: (r) => r.fileName,
      cell: (r) => (
        <div className="flex items-center gap-1.5">
          <FileSpreadsheet className="size-4 shrink-0 text-success" />
          <span className="max-w-64 truncate" title={r.fileName}>{r.fileName}</span>
        </div>
      ),
    },
    { key: "terminal", header: "Terminal", sortValue: (r) => r.terminal, cell: (r) => <TerminalTag code={r.terminal} /> },
    { key: "by", header: "Uploaded by", sortValue: (r) => r.uploadedBy, cell: (r) => <span className="whitespace-nowrap">{r.uploadedBy}</span> },
    { key: "at", header: "Date", sortValue: (r) => r.uploadedAt, cell: (r) => <span className="whitespace-nowrap">{formatDateTime(r.uploadedAt)}</span> },
    { key: "total", header: "Total", align: "right", sortValue: (r) => r.total, cell: (r) => r.total },
    { key: "ok", header: "Successful", align: "right", sortValue: (r) => r.success, cell: (r) => <span className="font-medium text-success">{r.success}</span> },
    { key: "failed", header: "Failed", align: "right", sortValue: (r) => r.failed, cell: (r) => <span className={r.failed ? "font-medium text-danger" : "text-slate"}>{r.failed}</span> },
    { key: "dup", header: "Duplicate", align: "right", sortValue: (r) => r.duplicate, cell: (r) => <span className={r.duplicate ? "font-medium text-amber-600" : "text-slate"}>{r.duplicate}</span> },
    { key: "status", header: "Status", sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "action",
      header: "",
      align: "right",
      cell: (r) => (
        <Button variant="ghost" size="sm" render={<Link href={`/terminal-imports/${r.id}`} onClick={(e) => e.stopPropagation()} />}>
          View
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Terminal Imports"
        description="Import and validate daily terminal reports (CWIT, SAGT, CICT). Every uploaded file is fingerprinted so a repeated file can never create duplicate counted movements."
        actions={
          canRun ? (
            <Button render={<Link href="/terminal-imports/new" />}>
              <Plus /> New import
            </Button>
          ) : (
            <Button disabled title="Your role cannot run imports">
              <Plus /> New import
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total imports" value={stats.totalImports} icon={FileUp} tone="navy" hint="Incl. rejected duplicate files" />
        <StatCard label="Rows imported" value={stats.rowsImported} icon={ListChecks} tone="green" hint="Became movements" />
        <StatCard label="Rows rejected / held" value={stats.rowsRejected} icon={Rows3} tone="orange" hint="Invalid or duplicate rows" />
        <StatCard label="Exceptions raised" value={stats.exceptionsRaised} icon={AlertTriangle} tone="red" hint="From imported rows" />
        <StatCard label="Duplicate files rejected" value={stats.duplicateFiles} icon={CopyX} tone="blue" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_22rem]">
        <SectionCard title="Source terminals" description="Report sources available for import.">
          <div className="grid gap-3 sm:grid-cols-3">
            {SOURCE_TERMINALS.map((code) => {
              const t = db.terminals.find((x) => x.code === code);
              const count = db.imports.filter((i) => i.terminal === code && i.status !== "Rejected – Duplicate File").length;
              return (
                <div key={code} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <TerminalTag code={code} className="text-base" />
                    {t && <StatusBadge status={t.status} />}
                  </div>
                  <div className="mt-1 text-xs text-slate">{t?.note}</div>
                  <div className="mt-2 text-xs font-medium text-ink">{count} import(s) on record</div>
                  {t?.status === "Conditional" && (
                    <div className="mt-1 text-[11px] text-amber-700">Pending sample validation – trial (pilot) import only.</div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
        <SectionCard title="Sample files" description="Different column layouts with valid rows, invalid rows, duplicates and missing driver / truck data.">
          <ul className="space-y-2">
            {SAMPLE_FILES.map((s) => (
              <li key={s.href} className="flex items-start gap-2">
                <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <a href={s.href} download className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                    {s.name} <Download className="size-3" />
                  </a>
                  <div className="text-xs text-slate">{s.description}</div>
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="Import history" className="mt-4" bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
          <SearchInput value={q} onChange={setQ} placeholder="Search import ID, file or uploader…" className="w-72 max-w-full" />
          <NativeSelect className="w-36" value={terminal} onValueChange={setTerminal} placeholder="All terminals" options={SOURCE_TERMINALS} aria-label="Terminal" />
          <NativeSelect className="w-56" value={status} onValueChange={setStatus} placeholder="All statuses" options={STATUSES} aria-label="Status" />
          {(q || terminal || status) && (
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); setTerminal(""); setStatus(""); }}>Clear filters</Button>
          )}
          <span className="ml-auto text-xs text-slate">{rows.length} of {db.imports.length} import(s)</span>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          getRowId={(r) => r.id}
          onRowClick={(r) => router.push(`/terminal-imports/${r.id}`)}
          initialSort={{ key: "at", dir: "desc" }}
          emptyTitle="No imports found"
          emptyDescription={db.imports.length ? "No import matches the current filters." : "Upload your first terminal report to get started."}
          emptyAction={canRun ? <Button size="sm" render={<Link href="/terminal-imports/new" />}><Plus /> New import</Button> : undefined}
        />
      </SectionCard>
    </>
  );
}
