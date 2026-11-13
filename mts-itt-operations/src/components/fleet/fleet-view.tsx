"use client";

import Link from "next/link";
import { Fuel, Truck, Wrench, AlertTriangle, CircleCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { serviceStatusOf } from "@/lib/fleet-utils";
import { VehicleTable } from "./vehicle-table";

export function FleetView() {
  const { db } = useApp();
  const { isDriver } = useAuth();
  if (isDriver) return <EmptyState title="Fleet is not available" description="This area is not available for driver accounts." />;
  const total = db.primeMovers.length;
  const active = db.primeMovers.filter((v) => v.status === "Active").length;
  const maint = db.primeMovers.filter((v) => v.status === "In Maintenance").length;
  const overdue = db.primeMovers.filter((v) => serviceStatusOf(v.nextServiceDate) === "Overdue").length;
  const dueSoon = db.primeMovers.filter((v) => serviceStatusOf(v.nextServiceDate) === "Due Soon").length;
  return (
    <div>
      <PageHeader
        title="Fleet"
        description="Prime mover directory with assignments, movement counts and derived service status."
        actions={
          <Button render={<Link href="/fleet/fuel" />}>
            <Fuel /> Fuel & reconciliation
          </Button>
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Prime movers" value={total} icon={Truck} tone="navy" />
        <StatCard label="Active" value={active} icon={CircleCheck} tone="green" hint={`${total - active - maint} inactive`} />
        <StatCard label="In maintenance" value={maint} icon={Wrench} tone={maint ? "orange" : "grey"} />
        <StatCard label="Service overdue / due soon" value={`${overdue} / ${dueSoon}`} icon={AlertTriangle} tone={overdue ? "red" : dueSoon ? "orange" : "grey"} hint="Due soon = within 14 days" />
      </div>
      <VehicleTable />
    </div>
  );
}
