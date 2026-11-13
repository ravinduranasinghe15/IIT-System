"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, CopyX, FileSearch, ListChecks, Rows3, XCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { KeyValue, SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import { formatDateTime } from "@/lib/date-utils";
import { STD_FIELDS } from "@/types/import";
import type { ExceptionRecord } from "@/types/exception";
import { TerminalTag } from "./import-common";
import { RowResultsTable } from "./validation-results";

export function ImportDetailView() {
  const { id } = useParams<{ id: string }>();
  const { db } = useApp();
  const imp = db.imports.find((i) => i.id === id);

  if (!imp) {
    return (
      <div className="rounded-xl border bg-card py-6 shadow-sm">
        <EmptyState
          icon={FileSearch}
          title={`Import ${id} not found`}
          description="It may have been removed by resetting the demo data."
          action={<Button variant="outline" render={<Link href="/terminal-imports" />}>Back to import history</Button>}
        />
      </div>
    );
  }

  const isDupFile = imp.status === "Rejected – Duplicate File";
  const original = isDupFile ? db.imports.find((i) => i.id !== imp.id && i.fingerprint === imp.fingerprint && i.status !== "Rejected – Duplicate File") : undefined;
  const dupes = db.imports.filter((i) => i.id !== imp.id && i.fingerprint === imp.fingerprint && i.status === "Rejected – Duplicate File");
  const exceptions: ExceptionRecord[] = db.exceptions.filter((e) => e.importId === imp.id);
  const movements = db.movements.filter((m) => m.importId === imp.id);
  const warnRows = imp.rows.filter((r) => r.status === "Imported" && r.warnings.length).length;

  const exColumns: Column<ExceptionRecord>[] = [
    { key: "id", header: "Exception", cell: (e) => <Link href={`/exceptions/${e.id}`} className="font-semibold text-brand hover:underline">{e.id}</Link> },
    { key: "mv", header: "Movement", cell: (e) => <Link href={`/movements/${e.movementId}`} className="text-brand hover:underline">{e.movementId}</Link> },
    { key: "cn", header: "Container", cell: (e) => <span className="font-mono text-xs">{e.containerNo}</span> },
    { key: "type", header: "Type", cell: (e) => e.type },
    { key: "pri", header: "Priority", cell: (e) => <StatusBadge status={e.priority} /> },
    { key: "st", header: "Status", cell: (e) => <StatusBadge status={e.status} /> },
  ];

  return (
    <>
      <PageHeader
        title={`Import ${imp.id}`}
        description={imp.fileName}
        badge={
          <>
            <StatusBadge status={imp.status} />
            {imp.terminal === "CICT" && <StatusBadge status="Conditional" />}
          </>
        }
        actions={
          <Button variant="outline" render={<Link href="/terminal-imports" />}>
            <ArrowLeft /> Import history
          </Button>
        }
      />

      {isDupFile && (
        <Alert variant="destructive" className="mb-4">
          <CopyX />
          <AlertTitle>Rejected – Duplicate File</AlertTitle>
          <AlertDescription>
            {imp.note}
            {original && (
              <>
                {" "}Original import: <Link href={`/terminal-imports/${original.id}`} className="font-semibold underline">{original.id}</Link>.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      {imp.terminal === "CICT" && (
        <Alert className="mb-4 border-amber-300 bg-amber-50/60">
          <AlertTriangle className="text-amber-600" />
          <AlertTitle className="text-amber-800">CICT pilot import</AlertTitle>
          <AlertDescription className="text-amber-800/90">Source format is pending sample validation – results are provisional.</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Total rows" value={imp.total} icon={Rows3} tone="navy" />
        <StatCard label="Successful" value={imp.success} icon={CheckCircle2} tone="green" hint={warnRows ? `${warnRows} with warnings` : undefined} />
        <StatCard label="Failed" value={imp.failed} icon={XCircle} tone="red" />
        <StatCard label="Duplicates" value={imp.duplicate} icon={CopyX} tone="orange" />
        <StatCard label="Exceptions raised" value={imp.exceptionsRaised} icon={AlertTriangle} tone="red" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <SectionCard title="Import details" className="xl:col-span-2">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <KeyValue label="Import ID">{imp.id}</KeyValue>
            <KeyValue label="File name">{imp.fileName}</KeyValue>
            <KeyValue label="Source terminal"><TerminalTag code={imp.terminal} /></KeyValue>
            <KeyValue label="Uploaded by">{imp.uploadedBy}</KeyValue>
            <KeyValue label="Uploaded at">{formatDateTime(imp.uploadedAt)}</KeyValue>
            <KeyValue label="Movements created">{movements.length}</KeyValue>
            <KeyValue label="File fingerprint" className="sm:col-span-3">
              <span className="break-all font-mono text-xs">{imp.fingerprint}</span>
            </KeyValue>
            {imp.note && !isDupFile && (
              <KeyValue label="Note" className="sm:col-span-3">{imp.note}</KeyValue>
            )}
            {dupes.length > 0 && (
              <KeyValue label="Later duplicate uploads" className="sm:col-span-3">
                {dupes.map((d) => (
                  <Link key={d.id} href={`/terminal-imports/${d.id}`} className="mr-2 font-medium text-brand hover:underline">{d.id}</Link>
                ))}
                <span className="text-xs text-slate">(rejected – identical file)</span>
              </KeyValue>
            )}
          </dl>
        </SectionCard>
        <SectionCard title="Column mapping used" description="Source column → standard field">
          {Object.keys(imp.mapping).length ? (
            <ul className="space-y-1 text-xs">
              {STD_FIELDS.map((f) => (
                <li key={f.key} className="flex items-center justify-between gap-2 border-b border-dashed pb-1 last:border-0">
                  <span className="text-slate">{f.label}</span>
                  <span className="truncate font-mono text-ink">{imp.mapping[f.key] ?? "—"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate">No mapping recorded.</p>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Row-level results"
        description="Every source row is kept – including invalid and duplicate rows – with the reason it was imported or held."
        className="mt-4"
        bodyClassName="p-0"
      >
        {imp.rows.length ? (
          <RowResultsTable rows={imp.rows} fileLabel={imp.id} />
        ) : (
          <EmptyState icon={ListChecks} title="No row detail stored" description="This import was recorded as a summary only." />
        )}
      </SectionCard>

      <SectionCard title="Exceptions raised by this import" className="mt-4" bodyClassName="p-0">
        <DataTable
          columns={exColumns}
          rows={exceptions}
          getRowId={(e) => e.id}
          pageSize={10}
          hidePagerIfSinglePage
          emptyTitle="No exceptions raised"
          emptyDescription="All imported rows passed reconciliation."
        />
      </SectionCard>
    </>
  );
}
