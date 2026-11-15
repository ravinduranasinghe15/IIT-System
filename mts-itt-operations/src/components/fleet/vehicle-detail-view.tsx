"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Fuel, Pencil, Plus, Wrench } from "lucide-react";
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
import { daysToService, serviceStatusOf } from "@/lib/fleet-utils";
import { reconcileFuel } from "@/lib/fuel-reconciliation";
import { formatDate, formatDateTime } from "@/lib/date-utils";
import { formatNumber } from "@/lib/utils";
import type { Movement } from "@/types/movement";
import type { Driver, RosterEntry } from "@/types/driver";
import type { GpsImport } from "@/types/fuel";
import { ServiceLogs } from "./service-logs";
import { FuelTable } from "./fuel-table";
import { FuelReconciliation } from "./fuel-reconciliation";
import { FuelEntryDialog } from "./fuel-entry-dialog";
import { ServiceLogDialog, VehicleEditDialog } from "./vehicle-dialogs";

interface AssignmentRow {
  driverId: string;
  name: string;
  current: boolean;
  shifts: number;
  firstDate: string | null;
  lastDate: string | null;
  movements: number;
}

function buildAssignments(roster: RosterEntry[], drivers: Driver[], movements: Movement[], currentDriverId: string | null, vehicleId: string): AssignmentRow[] {
  const map = new Map<string, AssignmentRow>();
  const get = (driverId: string): AssignmentRow => {
    let row = map.get(driverId);
    if (!row) {
      row = { driverId, name: drivers.find((d) => d.id === driverId)?.name ?? driverId, current: false, shifts: 0, firstDate: null, lastDate: null, movements: 0 };
      map.set(driverId, row);
    }
    return row;
  };
  for (const r of roster) {
    if (r.primeMoverId !== vehicleId || (r.shift !== "Morning" && r.shift !== "Afternoon" && r.shift !== "Night")) continue;
    const row = get(r.driverId);
    row.shifts += 1;
    row.firstDate = !row.firstDate || r.date < row.firstDate ? r.date : row.firstDate;
    row.lastDate = !row.lastDate || r.date > row.lastDate ? r.date : row.lastDate;
  }
  for (const m of movements) if (m.driverId) get(m.driverId).movements += 1;
  if (currentDriverId) get(currentDriverId).current = true;
  return [...map.values()];
}

export function VehicleDetailView() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { db } = useApp();
  const { can, isDriver } = useAuth();
  const [dialog, setDialog] = useState<"edit" | "service" | "fuel" | null>(null);
  const vehicle = db.primeMovers.find((v) => v.id === id);

  const movements = useMemo(() => db.movements.filter((m) => m.primeMoverId === id).sort((a, b) => (b.loadingAt ?? b.createdAt).localeCompare(a.loadingAt ?? a.createdAt)), [db.movements, id]);
  const fuel = useMemo(() => db.fuelRecords.filter((r) => r.vehicleId === id), [db.fuelRecords, id]);
  const assignments = useMemo(
    () => buildAssignments(db.roster, db.drivers, movements, db.primeMovers.find((v) => v.id === id)?.driverId ?? null, id),
    [db.roster, db.drivers, db.primeMovers, movements, id],
  );
  const gpsHistory = useMemo(() => {
    return db.gpsImports
      .map((g) => {
        const recs = fuel.filter((r) => r.gpsImportId === g.id);
        return { g, records: recs.length, litres: recs.reduce((s, r) => s + r.litres, 0), km: recs.reduce((s, r) => s + (r.distanceKm ?? 0), 0) };
      })
      .filter((x) => x.records > 0);
  }, [db.gpsImports, fuel]);

  if (isDriver) return <EmptyState title="Fleet is not available" description="This area is not available for driver accounts." />;
  if (!vehicle) return <EmptyState title="Vehicle not found" description={`No prime mover with ID ${id}.`} action={<Button render={<Link href="/fleet" />}>Back to fleet</Button>} />;

  const trailer = vehicle.trailerId ? db.trailers.find((t) => t.id === vehicle.trailerId) : null;
  const driver = vehicle.driverId ? db.drivers.find((d) => d.id === vehicle.driverId) : null;
  const svc = serviceStatusOf(vehicle.nextServiceDate);
  const left = daysToService(vehicle.nextServiceDate);
  const manage = can("fleet.manage");
  const recon = reconcileFuel(db, { vehicleId: id });
  const flagged = recon.filter((r) => r.flagged).length;
  const completed = movements.filter((m) => m.status === "Completed").length;

  const mvCols: Column<Movement>[] = [
    { key: "id", header: "Movement", sortValue: (m) => m.id, cell: (m) => <Link href={`/movements/${m.id}`} className="font-medium text-brand hover:underline">{m.id}</Link> },
    { key: "c", header: "Container(s)", cell: (m) => <span className="font-mono text-xs">{m.containerNos.join(", ")}</span> },
    { key: "sz", header: "Size", cell: (m) => m.containerSize },
    { key: "route", header: "Route", cell: (m) => `${m.sourceTerminal} → ${m.destinationTerminal}` },
    { key: "drv", header: "Driver", cell: (m) => (m.driverId ? db.drivers.find((d) => d.id === m.driverId)?.name ?? m.driverId : "—") },
    { key: "date", header: "Loading", sortValue: (m) => m.loadingAt ?? "", cell: (m) => <span className="whitespace-nowrap">{formatDateTime(m.loadingAt)}</span> },
    { key: "st", header: "Status", sortValue: (m) => m.status, cell: (m) => <StatusBadge status={m.status} /> },
  ];
  const asgCols: Column<AssignmentRow>[] = [
    { key: "drv", header: "Driver", sortValue: (a) => a.name, cell: (a) => <Link href={`/drivers/${a.driverId}`} className="font-medium text-brand hover:underline">{a.name} ({a.driverId})</Link> },
    { key: "cur", header: "Assignment", cell: (a) => (a.current ? <StatusBadge status="Active" className="" /> : <span className="text-xs text-slate">Rostered / driven</span>) },
    { key: "sh", header: "Rostered shifts", align: "right", sortValue: (a) => a.shifts, cell: (a) => a.shifts },
    { key: "per", header: "Roster period", cell: (a) => (a.firstDate ? `${formatDate(a.firstDate)} – ${formatDate(a.lastDate)}` : "—") },
    { key: "mv", header: "Movements driven", align: "right", sortValue: (a) => a.movements, cell: (a) => a.movements },
  ];
  const gpsCols: Column<(typeof gpsHistory)[number]>[] = [
    { key: "id", header: "Import", cell: (x) => <span className="font-medium text-navy">{x.g.id}</span> },
    { key: "file", header: "File", cell: (x) => x.g.fileName },
    { key: "period", header: "Period", cell: (x) => <span className="whitespace-nowrap">{formatDate(x.g.periodFrom)} – {formatDate(x.g.periodTo)}</span> },
    { key: "rec", header: "Records", align: "right", cell: (x) => x.records },
    { key: "l", header: "GPS litres", align: "right", cell: (x) => formatNumber(x.litres, 1) },
    { key: "km", header: "Distance (km)", align: "right", cell: (x) => formatNumber(x.km) },
    { key: "up", header: "Uploaded", cell: (x: { g: GpsImport }) => <span className="whitespace-nowrap">{formatDateTime(x.g.uploadedAt)} · {x.g.uploadedBy}</span> },
  ];

  return (
    <div>
      <PageHeader
        title={`${vehicle.id} · ${vehicle.regNo}`}
        badge={<StatusBadge status={vehicle.status} />}
        description={`${vehicle.make} ${vehicle.model} (${vehicle.year}) · ${vehicle.vehicleType}`}
        actions={
          <>
            <Button variant="outline" render={<Link href="/fleet" />}>
              <ArrowLeft /> Fleet
            </Button>
            {manage && (
              <>
                <Button variant="outline" onClick={() => setDialog("fuel")}>
                  <Fuel /> Add fuel entry
                </Button>
                <Button variant="outline" onClick={() => setDialog("service")}>
                  <Plus /> Service log
                </Button>
                <Button onClick={() => setDialog("edit")}>
                  <Pencil /> Edit
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Service status" value={svc} icon={Wrench} tone={svc === "OK" ? "green" : svc === "Due Soon" ? "orange" : "red"} hint={left === null ? undefined : left < 0 ? `${-left} day(s) overdue` : `due in ${left} day(s)`} />
        <StatCard label="Movements" value={movements.length} tone="navy" hint={`${completed} completed`} />
        <StatCard label="Odometer" value={`${formatNumber(vehicle.odometerKm)} km`} tone="blue" />
        <StatCard label="Flagged fuel months" value={flagged} icon={Fuel} tone={flagged ? "red" : "grey"} hint={`Above ±${db.settings.fuelVarianceThresholdPct}%`} />
      </div>

      <Tabs defaultValue="details">
        <TabsList className="mb-1 h-auto flex-wrap">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="movements">Movements ({movements.length})</TabsTrigger>
          <TabsTrigger value="drivers">Driver assignments</TabsTrigger>
          <TabsTrigger value="service">Service records</TabsTrigger>
          <TabsTrigger value="fuel">Fuel records</TabsTrigger>
          <TabsTrigger value="gps">GPS imports</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title="Vehicle information">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <KeyValue label="Vehicle ID">{vehicle.id}</KeyValue>
                <KeyValue label="Registration">{vehicle.regNo}</KeyValue>
                <KeyValue label="Type">{vehicle.vehicleType}</KeyValue>
                <KeyValue label="Make / model">{vehicle.make} {vehicle.model}</KeyValue>
                <KeyValue label="Year">{vehicle.year}</KeyValue>
                <KeyValue label="Odometer">{formatNumber(vehicle.odometerKm)} km</KeyValue>
                <KeyValue label="Status"><StatusBadge status={vehicle.status} /></KeyValue>
                <KeyValue label="Next service">{formatDate(vehicle.nextServiceDate)} <StatusBadge status={svc} className="ml-1" /></KeyValue>
              </dl>
            </SectionCard>
            <SectionCard title="Assignments">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <KeyValue label="Current driver">{driver ? <Link href={`/drivers/${driver.id}`} className="text-brand hover:underline">{driver.name} ({driver.id})</Link> : "Unassigned"}</KeyValue>
                <KeyValue label="Driver status">{driver ? <StatusBadge status={driver.status} /> : "—"}</KeyValue>
                <KeyValue label="Trailer">{trailer ? `${trailer.id} · ${trailer.regNo}` : "None"}</KeyValue>
                <KeyValue label="Trailer type">{trailer ? trailer.trailerType : "—"}</KeyValue>
                <KeyValue label="Capacity" className="col-span-2">{trailer?.capacity ?? "—"}</KeyValue>
              </dl>
              <p className="mt-3 text-xs text-slate">Vehicle, trailer and registration data is maintained in Master Data; driver assignment is changed from the driver profile.</p>
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="movements">
          <SectionCard bodyClassName="p-0">
            <DataTable columns={mvCols} rows={movements} getRowId={(m) => m.id} initialSort={{ key: "date", dir: "desc" }} emptyTitle="No movements for this vehicle" />
          </SectionCard>
        </TabsContent>

        <TabsContent value="drivers">
          <SectionCard title="Driver assignments" description="Current driver plus drivers rostered on, or who moved containers with, this prime mover." bodyClassName="p-0">
            <DataTable columns={asgCols} rows={assignments} getRowId={(a) => a.driverId} initialSort={{ key: "sh", dir: "desc" }} emptyTitle="No driver assignments" />
          </SectionCard>
        </TabsContent>

        <TabsContent value="service">
          <SectionCard bodyClassName="p-0">
            <ServiceLogs vehicleId={id} />
          </SectionCard>
        </TabsContent>

        <TabsContent value="fuel">
          <div className="space-y-4">
            <SectionCard title="Monthly reconciliation" bodyClassName="p-0">
              <FuelReconciliation vehicleId={id} />
            </SectionCard>
            <SectionCard title="Fuel records" bodyClassName="p-0">
              <FuelTable records={fuel} showVehicle={false} />
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="gps">
          <SectionCard title="GPS import history" bodyClassName="p-0">
            <DataTable columns={gpsCols} rows={gpsHistory} getRowId={(x) => x.g.id} emptyTitle="No GPS imports for this vehicle" />
          </SectionCard>
        </TabsContent>
      </Tabs>

      {dialog === "edit" && <VehicleEditDialog vehicle={vehicle} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === "service" && <ServiceLogDialog vehicleId={id} open onOpenChange={(o) => !o && setDialog(null)} />}
      {dialog === "fuel" && <FuelEntryDialog vehicleId={id} open onOpenChange={(o) => !o && setDialog(null)} />}
    </div>
  );
}
