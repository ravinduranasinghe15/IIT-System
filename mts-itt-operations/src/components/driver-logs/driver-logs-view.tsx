"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, FileWarning, Truck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { formatDateTime } from "@/lib/date-utils";
import { driverLogStats, logCovers, type MissingLog } from "@/lib/driver-logs";
import type { EvidenceDoc } from "@/types/evidence";
import { DriverLogUploadDialog, type LogPrefill } from "./driver-log-upload";

export function DriverLogsView() {
  const { db } = useApp();
  const { can, isDriver } = useAuth();
  const [upload, setUpload] = useState<{ open: boolean; prefill?: LogPrefill }>({ open: false });
  const [showAll, setShowAll] = useState(false);
  const canUpload = can("driverlog.upload");

  const stats = useMemo(() => driverLogStats(db), [db]);
  const driverName = (id: string | null) => (id ? (db.drivers.find((d) => d.id === id)?.name ?? id) : "—");
  const plate = (id: string | null) => (id ? (db.primeMovers.find((p) => p.id === id)?.regNo ?? id) : "—");
  const lorriesMissing = new Set(stats.missing.map((x) => x.movement.primeMoverId ?? x.movement.driverId ?? x.movement.id)).size;

  if (isDriver) {
    return (
      <div className="rounded-xl border bg-card py-6 shadow-sm">
        <EmptyState title="Driver logs are not available for the driver role" description="Driver log sheets are submitted by supervisors." />
      </div>
    );
  }

  const missingCols: Column<MissingLog>[] = [
    { key: "mv", header: "Movement", sortValue: (r) => r.movement.id, cell: (r) => <Link href={`/movements/${r.movement.id}`} className="font-medium text-brand hover:underline">{r.movement.id}</Link> },
    { key: "cn", header: "Container(s)", cell: (r) => <span className="font-mono text-xs">{r.movement.containerNos.join(" / ")}</span> },
    { key: "route", header: "Route", cell: (r) => `${r.movement.sourceTerminal} → ${r.movement.destinationTerminal}` },
    { key: "truck", header: "Lorry", sortValue: (r) => plate(r.movement.primeMoverId), cell: (r) => plate(r.movement.primeMoverId) },
    { key: "driver", header: "Driver", sortValue: (r) => driverName(r.movement.driverId), cell: (r) => driverName(r.movement.driverId) },
    { key: "load", header: "Loaded", sortValue: (r) => r.movement.loadingAt, cell: (r) => <span className="whitespace-nowrap text-xs">{formatDateTime(r.movement.loadingAt)}</span> },
    {
      key: "log",
      header: "Missing log",
      sortValue: (r) => `${r.date}${r.shift}`,
      cell: (r) => (
        <div>
          <div className="whitespace-nowrap text-sm text-danger">{r.shift} · {r.date}</div>
          {r.note && <div className="text-[11px] text-slate">{r.note}</div>}
        </div>
      ),
    },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (r) =>
        canUpload ? (
          <Button size="xs" variant="outline" onClick={() => setUpload({ open: true, prefill: { driverId: r.movement.driverId, primeMoverId: r.movement.primeMoverId, date: r.date, shift: r.shift } })}>
            <Upload /> Upload
          </Button>
        ) : null,
    },
  ];

  const sheetCols: Column<EvidenceDoc>[] = [
    { key: "id", header: "Sheet", sortValue: (d) => d.id, cell: (d) => <Link href={`/evidence?doc=${d.id}`} className="font-medium text-brand hover:underline">{d.id}</Link> },
    { key: "name", header: "File", cell: (d) => <span className="text-xs text-slate">{d.name}</span> },
    { key: "driver", header: "Driver", cell: (d) => driverName(d.driverLog!.driverId) },
    { key: "lorry", header: "Lorry", cell: (d) => plate(d.driverLog!.primeMoverId) },
    { key: "date", header: "Date", sortValue: (d) => d.driverLog!.date, cell: (d) => d.driverLog!.date },
    { key: "shift", header: "Shift", cell: (d) => <StatusBadge status={d.driverLog!.shift} /> },
    { key: "ver", header: "Verification", sortValue: (d) => (d.ocr?.verified ? 1 : 0), cell: (d) => <StatusBadge status={d.ocr?.verified ? "Verified" : "Needs Verification"} /> },
    { key: "cov", header: "Movements covered", align: "right", cell: (d) => db.movements.filter((m) => logCovers(d.driverLog!, m)).length },
    { key: "by", header: "Uploaded", sortValue: (d) => d.uploadedAt, cell: (d) => <span className="text-xs text-slate">{d.uploadedBy} · {formatDateTime(d.uploadedAt)}</span> },
  ];

  return (
    <>
      <PageHeader
        title="Driver Logs"
        description="Driver log sheets (one per driver per shift) submitted by supervisors, and the movements that still have no log."
        actions={
          <Button disabled={!canUpload} title={canUpload ? undefined : "Your role cannot upload driver logs"} onClick={() => setUpload({ open: true })}>
            <Upload /> Upload driver log
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Log sheets uploaded" value={stats.sheets.length} icon={ClipboardList} tone="navy" />
        <StatCard label="Movements with a log" value={stats.covered} icon={CheckCircle2} tone="green" hint={`of ${stats.required} dispatched movements`} />
        <StatCard label="Missing logs" value={stats.missing.length} icon={FileWarning} tone="red" hint="Movements not on any driver log sheet" />
        <StatCard label="Lorries / drivers affected" value={lorriesMissing} icon={Truck} tone="orange" hint="With at least one missing log" />
      </div>

      <div className="mt-4 space-y-4">
        <SectionCard title="Missing driver logs" description="Movements loaded in a shift with no driver log sheet for that lorry or driver" bodyClassName="p-0">
          {/* phone: one card per movement with the Upload button always in reach */}
          <div className="md:hidden">
            {stats.missing.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate">No missing logs – every dispatched movement is covered.</div>
            ) : (
              <ul className="divide-y">
                {(showAll ? stats.missing : stats.missing.slice(0, 6)).map((r) => (
                  <li key={r.movement.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Link href={`/movements/${r.movement.id}`} className="font-semibold text-brand">{r.movement.id}</Link>
                        <span className="text-xs text-slate">{r.movement.sourceTerminal} → {r.movement.destinationTerminal}</span>
                      </div>
                      <div className="truncate font-mono text-[11px] text-slate">{r.movement.containerNos.join(" / ")}</div>
                      <div className="text-xs text-ink">{plate(r.movement.primeMoverId)} · {driverName(r.movement.driverId)}</div>
                      <div className="text-xs text-danger">Missing: {r.shift} · {r.date}</div>
                      {r.note && <div className="text-[11px] text-slate">{r.note}</div>}
                    </div>
                    {canUpload && (
                      <Button size="sm" variant="outline" className="shrink-0" onClick={() => setUpload({ open: true, prefill: { driverId: r.movement.driverId, primeMoverId: r.movement.primeMoverId, date: r.date, shift: r.shift } })}>
                        <Upload /> Upload
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {stats.missing.length > 6 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full border-t px-4 py-2.5 text-sm font-medium text-brand">
                {showAll ? "Show fewer" : `Show all ${stats.missing.length}`}
              </button>
            )}
          </div>
          <div className="hidden md:block">
          <DataTable
            columns={missingCols}
            rows={stats.missing}
            getRowId={(r) => r.movement.id}
            pageSize={10}
            emptyTitle="No missing logs"
            emptyDescription="Every dispatched movement is covered by a driver log sheet."
          />
          </div>
        </SectionCard>
        <SectionCard title="Driver log sheets" bodyClassName="p-0">
          <DataTable
            columns={sheetCols}
            rows={stats.sheets}
            getRowId={(d) => d.id}
            pageSize={10}
            initialSort={{ key: "date", dir: "desc" }}
            emptyTitle="No driver log sheets uploaded yet"
            emptyDescription="Use Upload driver log to submit a sheet."
          />
        </SectionCard>
      </div>

      <DriverLogUploadDialog open={upload.open} onOpenChange={(o) => setUpload((u) => ({ ...u, open: o }))} prefill={upload.prefill} />
    </>
  );
}
