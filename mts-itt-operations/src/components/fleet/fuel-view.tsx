"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Droplets, Flag, Plus, Upload, Scale, ClipboardCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/shared/section-card";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { fuelMonths, fuelReconSummary, reconcileFuel } from "@/lib/fuel-reconciliation";
import { formatDate, formatDateTime, formatMonth } from "@/lib/date-utils";
import { formatNumber } from "@/lib/utils";
import type { GpsImport } from "@/types/fuel";
import { FuelTable } from "./fuel-table";
import { FuelReconciliation } from "./fuel-reconciliation";
import { FuelEntryDialog } from "./fuel-entry-dialog";
import { GpsImportDialog } from "./gps-import-dialog";
import { FuelInvoiceImportDialog } from "./fuel-invoice-import-dialog";
import { DEMO_FUEL_FILE_HREF } from "@/data/demo-fuel-invoices";

export function FuelView() {
  const { db } = useApp();
  const { can, isDriver } = useAuth();
  const [entryOpen, setEntryOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const manage = can("fleet.manage");

  const latest = useMemo(() => fuelMonths(db)[0] ?? "", [db]);
  const summary = useMemo(() => fuelReconSummary(reconcileFuel(db, { month: latest })), [db, latest]);
  const allSummary = useMemo(() => fuelReconSummary(reconcileFuel(db)), [db]);

  const importCols: Column<GpsImport>[] = [
    { key: "id", header: "Import ID", sortValue: (g) => g.id, cell: (g) => <span className="font-medium text-navy">{g.id}</span> },
    { key: "file", header: "File", cell: (g) => g.fileName },
    { key: "prov", header: "Provider", cell: (g) => g.provider },
    { key: "period", header: "Period", sortValue: (g) => g.periodFrom, cell: (g) => <span className="whitespace-nowrap">{formatDate(g.periodFrom)} – {formatDate(g.periodTo)}</span> },
    { key: "rec", header: "Records", align: "right", sortValue: (g) => g.records, cell: (g) => g.records },
    { key: "veh", header: "Vehicles", align: "right", cell: (g) => g.vehicles },
    { key: "litres", header: "GPS litres", align: "right", cell: (g) => formatNumber(db.fuelRecords.filter((r) => r.gpsImportId === g.id).reduce((s, r) => s + r.litres, 0), 1) },
    { key: "by", header: "Uploaded by", cell: (g) => g.uploadedBy },
    { key: "at", header: "Uploaded", sortValue: (g) => g.uploadedAt, cell: (g) => <span className="whitespace-nowrap">{formatDateTime(g.uploadedAt)}</span> },
  ];

  if (isDriver) return <EmptyState title="Fuel is not available" description="This area is not available for driver accounts." />;

  return (
    <div>
      <PageHeader
        title="Fuel & reconciliation"
        description="GPS (Track My Car) fuel vs fuel-station records. Originals are preserved; reviews are stored separately."
        actions={
          <>
            <Button variant="outline" render={<a href="/documents/sample-trackmycar.csv" download />}>
              <Download /> Sample GPS file
            </Button>
            <Button variant="outline" render={<a href={DEMO_FUEL_FILE_HREF} download />}>
              <Download /> Sample invoices file
            </Button>
            <Button variant="outline" render={<Link href="/fleet" />}>
              Fleet
            </Button>
            {manage && (
              <>
                <Button variant="outline" onClick={() => setImportOpen(true)}>
                  <Upload /> Import Track My Car
                </Button>
                <Button variant="outline" onClick={() => setInvoiceOpen(true)}>
                  <Upload /> Import fuel invoices
                </Button>
                <Button onClick={() => setEntryOpen(true)}>
                  <Plus /> Add fuel entry
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`GPS litres${latest ? ` · ${formatMonth(latest)}` : ""}`} value={formatNumber(summary.gpsLitres, 0)} icon={Droplets} tone="blue" />
        <StatCard label="Fuel-station litres" value={formatNumber(summary.invoiceLitres, 0)} icon={Scale} tone="green" hint="Invoices + manual entries" />
        <StatCard label="Flagged vehicle-months" value={allSummary.flagged} icon={Flag} tone={allSummary.flagged ? "red" : "grey"} hint={`Above ±${db.settings.fuelVarianceThresholdPct}%`} />
        <StatCard label="Pending review" value={allSummary.pendingReview} icon={ClipboardCheck} tone={allSummary.pendingReview ? "orange" : "grey"} />
      </div>

      <Tabs defaultValue="recon">
        <TabsList className="mb-1">
          <TabsTrigger value="recon">Reconciliation</TabsTrigger>
          <TabsTrigger value="records">Fuel records</TabsTrigger>
          <TabsTrigger value="imports">GPS imports</TabsTrigger>
        </TabsList>
        <TabsContent value="recon">
          <SectionCard bodyClassName="p-0">
            <FuelReconciliation />
          </SectionCard>
        </TabsContent>
        <TabsContent value="records">
          <SectionCard bodyClassName="p-0">
            <FuelTable records={db.fuelRecords} />
          </SectionCard>
        </TabsContent>
        <TabsContent value="imports">
          <SectionCard title="Track My Car import history" bodyClassName="p-0">
            <DataTable columns={importCols} rows={db.gpsImports} getRowId={(g) => g.id} initialSort={{ key: "at", dir: "desc" }} emptyTitle="No GPS imports yet" emptyDescription="Import a Track My Car export to create GPS fuel records." />
          </SectionCard>
        </TabsContent>
      </Tabs>

      {entryOpen && <FuelEntryDialog open onOpenChange={setEntryOpen} />}
      {importOpen && <GpsImportDialog open onOpenChange={setImportOpen} />}
      {invoiceOpen && <FuelInvoiceImportDialog open onOpenChange={setInvoiceOpen} />}
    </div>
  );
}
