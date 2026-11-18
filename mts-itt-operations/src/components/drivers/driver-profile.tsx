"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Pencil, Phone, ShieldAlert, UserCog } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard, KeyValue } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useDriverStats } from "@/hooks/use-drivers";
import { daysBetween, demoToday, formatDate, formatDateTime } from "@/lib/date-utils";
import { formatMoney } from "@/lib/utils";
import type { LeaveRecord, RosterEntry } from "@/types/driver";
import type { Movement } from "@/types/movement";
import { DriverStatusDialog, EditDriverDialog } from "./driver-dialogs";

interface PayHistoryRow {
  runId: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  currency: string;
  completed: number;
  units: number;
  rate: number;
  adjustments: number;
  total: number;
}

export function DriverProfile() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { db } = useApp();
  const { can, isDriver, driverId, canSeeFinancials } = useAuth();
  const stats = useDriverStats();
  const [dialog, setDialog] = useState<"edit" | "status" | null>(null);
  const driver = db.drivers.find((d) => d.id === id);
  const today = demoToday();

  const movements = useMemo(() => db.movements.filter((m) => m.driverId === id).sort((a, b) => (b.loadingAt ?? b.createdAt).localeCompare(a.loadingAt ?? a.createdAt)), [db.movements, id]);
  const rosterRows = useMemo(() => db.roster.filter((r) => r.driverId === id).sort((a, b) => b.date.localeCompare(a.date)), [db.roster, id]);
  const leaves = useMemo(() => db.leaves.filter((l) => l.driverId === id).sort((a, b) => b.from.localeCompare(a.from)), [db.leaves, id]);
  const pay = useMemo<PayHistoryRow[]>(
    () =>
      db.payRuns.flatMap((run) => {
        const line = run.lines.find((l) => l.driverId === id);
        return line
          ? [{ runId: run.id, periodStart: run.periodStart, periodEnd: run.periodEnd, status: run.status, currency: run.currency, completed: line.completedMovements, units: line.payableUnits, rate: line.rate, adjustments: line.adjustments, total: line.total }]
          : [];
      }).sort((a, b) => b.periodStart.localeCompare(a.periodStart)),
    [db.payRuns, id],
  );

  if (isDriver && driverId !== id) {
    return <EmptyState title="Not available" description="Drivers can only view their own information." action={<Button render={<Link href="/drivers/roster" />}>My roster</Button>} />;
  }
  if (!driver) {
    return <EmptyState title="Driver not found" description={`No driver with ID ${id}.`} action={<Button render={<Link href="/drivers" />}>Back to drivers</Button>} />;
  }

  // drivers are not tied to a truck: show the trucks the roster has had them on
  const truckNow = rosterRows.find((r) => r.date === today && r.primeMoverId && r.attendance !== "Absent")?.primeMoverId ?? null;
  const recentTrucks = (() => {
    const counts = new Map<string, number>();
    for (const r of rosterRows) if (r.primeMoverId && r.attendance !== "Absent" && r.date <= today) counts.set(r.primeMoverId, (counts.get(r.primeMoverId) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  })();
  const licenseLeft = daysBetween(today, driver.licenseExpiry);
  const s = stats.get(id) ?? { total: 0, completed: 0 };
  const manage = can("driver.manage");
  const presentCount = rosterRows.filter((r) => r.attendance === "Present").length;
  const lateCount = rosterRows.filter((r) => r.attendance === "Late").length;
  const absentCount = rosterRows.filter((r) => r.attendance === "Absent").length;

  const mvCols: Column<Movement>[] = [
    { key: "id", header: "Movement", sortValue: (m) => m.id, cell: (m) => <Link href={`/movements/${m.id}`} className="font-medium text-brand hover:underline">{m.id}</Link> },
    { key: "c", header: "Container(s)", cell: (m) => <span className="font-mono text-xs">{m.containerNos.join(", ")}</span> },
    { key: "sz", header: "Size", cell: (m) => m.containerSize },
    { key: "route", header: "Route", cell: (m) => `${m.sourceTerminal} → ${m.destinationTerminal}` },
    { key: "pm", header: "Prime Mover", cell: (m) => m.primeMoverId ?? "—" },
    { key: "date", header: "Loading", sortValue: (m) => m.loadingAt ?? "", cell: (m) => <span className="whitespace-nowrap">{formatDateTime(m.loadingAt)}</span> },
    { key: "st", header: "Status", sortValue: (m) => m.status, cell: (m) => <StatusBadge status={m.status} /> },
  ];
  const attCols: Column<RosterEntry>[] = [
    { key: "date", header: "Date", sortValue: (r) => r.date, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span> },
    { key: "shift", header: "Shift", cell: (r) => <StatusBadge status={r.shift} /> },
    { key: "pm", header: "Prime Mover", cell: (r) => r.primeMoverId ?? "—" },
    { key: "att", header: "Attendance", cell: (r) => (r.shift === "Morning" || r.shift === "Night" ? <StatusBadge status={r.date > today ? "Scheduled" : r.attendance} /> : <span className="text-slate">—</span>) },
    { key: "by", header: "Recorded by", cell: (r) => r.recordedBy ?? "—" },
  ];
  const leaveCols: Column<LeaveRecord>[] = [
    { key: "id", header: "Leave ID", cell: (l) => l.id },
    { key: "type", header: "Type", cell: (l) => l.type },
    { key: "from", header: "From", sortValue: (l) => l.from, cell: (l) => formatDate(l.from) },
    { key: "to", header: "To", cell: (l) => formatDate(l.to) },
    { key: "reason", header: "Reason", cell: (l) => <span className="text-slate">{l.reason}</span> },
    { key: "st", header: "Status", cell: (l) => <StatusBadge status={l.status === "Approved" ? "Approved" : l.status === "Rejected" ? "Rejected" : "Pending"} /> },
    { key: "by", header: "Decided by", cell: (l) => l.decidedBy ?? "—" },
  ];
  const payCols: Column<PayHistoryRow>[] = [
    { key: "run", header: "Pay run", sortValue: (r) => r.runId, cell: (r) => <Link href={`/payments/${r.runId}`} className="font-medium text-brand hover:underline">{r.runId}</Link> },
    { key: "period", header: "Period", sortValue: (r) => r.periodStart, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.periodStart)} – {formatDate(r.periodEnd)}</span> },
    { key: "done", header: "Completed", align: "right", cell: (r) => r.completed },
    { key: "units", header: "Payable units", align: "right", cell: (r) => r.units },
    { key: "rate", header: "Rate", align: "right", cell: (r) => formatMoney(r.rate, r.currency) },
    { key: "adj", header: "Adjustments", align: "right", cell: (r) => formatMoney(r.adjustments, r.currency) },
    { key: "total", header: "Total", align: "right", sortValue: (r) => r.total, cell: (r) => <span className="font-semibold">{formatMoney(r.total, r.currency)}</span> },
    { key: "st", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
  ];

  return (
    <div>
      <PageHeader
        title={driver.name}
        badge={<StatusBadge status={driver.status} />}
        description={`${driver.id} · ${driver.shift} shift · joined ${formatDate(driver.joinedAt)}`}
        actions={
          <>
            <Button variant="outline" render={<Link href={isDriver ? "/drivers/roster" : "/drivers"} />}>
              <ArrowLeft /> Back
            </Button>
            {manage && (
              <>
                <Button variant="outline" onClick={() => setDialog("status")}>
                  <UserCog /> Update status
                </Button>
                <Button onClick={() => setDialog("edit")}>
                  <Pencil /> Edit
                </Button>
              </>
            )}
          </>
        }
      />

      {licenseLeft < 90 && (
        <div className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${licenseLeft < 0 ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          <ShieldAlert className="size-4" />
          {licenseLeft < 0 ? `Driving licence expired on ${formatDate(driver.licenseExpiry)}.` : `Driving licence expires in ${licenseLeft} day(s) (${formatDate(driver.licenseExpiry)}).`}
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total movements" value={s.total} tone="navy" />
        <StatCard label="Completed" value={s.completed} tone="green" />
        <StatCard label="Attendance (Present / Late / Absent)" value={`${presentCount} / ${lateCount} / ${absentCount}`} tone="blue" hint="Rostered period" />
        <StatCard label="Truck today" value={truckNow ?? "None"} tone={truckNow ? "navy" : "grey"} hint={truckNow ? db.primeMovers.find((p) => p.id === truckNow)?.regNo : "Not rostered today"} />
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="mb-1 h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="movements">Movements ({movements.length})</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leave">Leave ({leaves.length})</TabsTrigger>
          {canSeeFinancials && <TabsTrigger value="payments">Payment history</TabsTrigger>}
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Personal & employment">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <KeyValue label="Driver ID">{driver.id}</KeyValue>
                <KeyValue label="Status"><StatusBadge status={driver.status} /></KeyValue>
                <KeyValue label="Contact"><span className="inline-flex items-center gap-1"><Phone className="size-3 text-slate" />{driver.phone}</span></KeyValue>
                <KeyValue label="Emergency contact">{driver.emergencyContact}</KeyValue>
                <KeyValue label="Licence no">{driver.licenseNo}</KeyValue>
                <KeyValue label="Licence expiry">{formatDate(driver.licenseExpiry)}</KeyValue>
                <KeyValue label="Default shift"><StatusBadge status={driver.shift} /></KeyValue>
                <KeyValue label="Joined">{formatDate(driver.joinedAt)}</KeyValue>
                <KeyValue label="Address" className="col-span-2">{driver.address}</KeyValue>
              </dl>
            </SectionCard>
            <SectionCard title="Trucks driven" description="From the roster – drivers are not tied to one truck">
              {recentTrucks.length ? (
                <ul className="divide-y text-sm">
                  {recentTrucks.map(([tid, n]) => {
                    const t = db.primeMovers.find((p) => p.id === tid);
                    return (
                      <li key={tid} className="flex items-center justify-between py-2">
                        <Link href={`/fleet/${tid}`} className="font-medium text-brand hover:underline">{tid}{t ? ` · ${t.regNo}` : ""}</Link>
                        <span className="text-xs text-slate">{n} shift{n === 1 ? "" : "s"}</span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState title="No truck history" description="This driver has not been rostered on a truck yet." />
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="movements">
          <SectionCard bodyClassName="p-0">
            <DataTable columns={mvCols} rows={movements} getRowId={(m) => m.id} initialSort={{ key: "date", dir: "desc" }} emptyTitle="No movements for this driver" />
          </SectionCard>
        </TabsContent>

        <TabsContent value="attendance">
          <SectionCard title="Attendance history" description="From the roster; recorded by supervisors and managers." bodyClassName="p-0">
            <DataTable columns={attCols} rows={rosterRows} getRowId={(r) => r.id} initialSort={{ key: "date", dir: "desc" }} pageSize={5} pageSizeOptions={[5, 10, 25]} emptyTitle="No roster entries" />
          </SectionCard>
        </TabsContent>

        <TabsContent value="leave">
          <SectionCard title="Leave history" bodyClassName="p-0">
            <DataTable columns={leaveCols} rows={leaves} getRowId={(l) => l.id} initialSort={{ key: "from", dir: "desc" }} emptyTitle="No leave records" />
          </SectionCard>
        </TabsContent>

        {canSeeFinancials && (
          <TabsContent value="payments">
            <SectionCard title="Payment history" description="From pay runs (demo simulation)." bodyClassName="p-0">
              <DataTable columns={payCols} rows={pay} getRowId={(r) => r.runId} initialSort={{ key: "period", dir: "desc" }} emptyTitle="No pay runs include this driver" />
            </SectionCard>
          </TabsContent>
        )}
      </Tabs>

      {dialog === "edit" && <EditDriverDialog driver={driver} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === "status" && <DriverStatusDialog driver={driver} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}
