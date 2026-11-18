"use client";

import Link from "next/link";
import { CalendarDays, Plus, TriangleAlert, UserCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { daysBetween, demoToday, realToday } from "@/lib/date-utils";
import { DriverTable } from "./driver-table";
import { PendingPayRequests } from "@/components/payments/pending-requests";

export function DriversView() {
  const { db } = useApp();
  const { can, isDriver } = useAuth();
  if (isDriver) {
    return <EmptyState title="Driver directory is not available" description="Drivers can view their own roster under Drivers & Roster." action={<Button render={<Link href="/drivers/roster" />}>Open my roster</Button>} />;
  }
  const today = demoToday();
  const active = db.drivers.filter((d) => d.status === "Active").length;
  const onDuty = db.roster.filter((r) => r.date === realToday() && (r.shift === "Morning" || r.shift === "Night") && r.attendance !== "Absent").length;
  const expiring = db.drivers.filter((d) => daysBetween(today, d.licenseExpiry) < 90).length;
  return (
    <div>
      <PageHeader
        title="Drivers"
        description="Driver directory and employment status. Drivers are rostered onto trucks shift by shift."
        actions={
          <>
            <Button variant="outline" render={<Link href="/drivers/roster" />}>
              <CalendarDays /> Roster
            </Button>
            {can("driver.manage") && (
              <Button render={<Link href="/drivers/new" />}>
                <Plus /> Register driver
              </Button>
            )}
          </>
        }
      />
      <PendingPayRequests className="mb-4" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Registered drivers" value={db.drivers.length} icon={Users} tone="navy" />
        <StatCard label="Active" value={active} icon={UserCheck} tone="green" hint={`${db.drivers.filter((d) => d.status === "On Leave").length} on leave`} />
        <StatCard label="On duty today" value={onDuty} icon={UserCheck} tone="navy" hint="Rostered on a truck today" />
        <StatCard label="Licences expiring / expired" value={expiring} icon={TriangleAlert} tone={expiring ? "red" : "grey"} hint="Within 90 days" />
      </div>
      <DriverTable />
    </div>
  );
}
