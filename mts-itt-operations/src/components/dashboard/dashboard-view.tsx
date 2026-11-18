"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, Container, Route, Truck, Users } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { demoToday, formatDay } from "@/lib/date-utils";
import {
  containerDistribution,
  dailyTrend,
  fleetStatus,
  fleetUtilisation,
  inWindow,
  recentMovements,
  terminalStats,
  todayStats,
} from "@/lib/stats";
import { MovementChart } from "./movement-chart";
import { TerminalChart } from "./terminal-chart";
import { ContainerChart } from "./container-chart";
import { FleetChart } from "./fleet-chart";
import { RecentMovements } from "./recent-movements";
import { RecentExceptions } from "./recent-exceptions";
import { ImportActivity } from "./import-activity";
import { FleetStatus } from "./fleet-status";
import { TerminalPerformance } from "./terminal-performance";
import { QuickActions } from "./quick-actions";
import { DriverRosterCard } from "./driver-roster-card";
import { CeoDashboard } from "./ceo-dashboard";

export function DashboardView() {
  const { db } = useApp();
  const { isDriver, driverId, user, role } = useAuth();
  const router = useRouter();
  const today = demoToday();

  const scoped = useMemo(() => (isDriver ? db.movements.filter((m) => m.driverId === driverId) : db.movements), [db.movements, isDriver, driverId]);
  const stats = useMemo(() => todayStats(db, today, scoped), [db, today, scoped]);
  const trend = useMemo(() => dailyTrend(db, today, 14, scoped), [db, today, scoped]);
  const tStats = useMemo(() => terminalStats(db, today, 14, scoped), [db, today, scoped]);
  const dist = useMemo(() => containerDistribution(inWindow(db, scoped, today, 14)), [db, today, scoped]);
  const fleet = useMemo(() => fleetStatus(db, today), [db, today]);
  const util = useMemo(() => fleetUtilisation(db, today), [db, today]);
  const recent = useMemo(() => recentMovements(scoped, 8), [scoped]);

  const description = `Operational day ${formatDay(today, "EEE dd MMM yyyy")} (07:00 → 07:00)${isDriver ? ` · showing your movements only, ${user.name}` : ""}`;

  if (role === "CEO") return <CeoDashboard />;

  if (isDriver) {
    return (
      <div>
        <PageHeader title="My Dashboard" description={description} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="My Movements Today" value={stats.total} hint="Journeys this operational day" icon={Route} tone="navy" onClick={() => router.push("/movements")} />
          <StatCard label="Completed" value={stats.completed} icon={CheckCircle2} tone="green" />
          <StatCard label="Pending / In Progress" value={stats.pending} icon={Clock} tone="orange" />
          <StatCard label="Containers Today" value={stats.containers} hint="Container units moved" icon={Container} tone="blue" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <MovementChart data={trend} title="My daily movement trend" />
          </div>
          <DriverRosterCard driverId={driverId ?? ""} />
        </div>
        <div className="mt-4">
          <RecentMovements movements={recent} showDriver={false} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Operations Dashboard" description={description} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(15rem,1fr))]">
        <StatCard label="Movements Today" value={stats.total} hint="Journeys" icon={Route} tone="navy" onClick={() => router.push("/movements")} />
        <StatCard label="Completed" value={stats.completed} hint="Today" icon={CheckCircle2} tone="green" />
        <StatCard label="Pending" value={stats.pending} hint="Pending / in transit / review" icon={Clock} tone="orange" />
        <StatCard label="Exceptions" value={stats.openExceptions} hint="Open / under review" icon={AlertTriangle} tone="red" onClick={() => router.push("/exceptions")} />
        <StatCard label="Active Prime Movers" value={stats.activePrimeMovers} hint={`of ${stats.totalPrimeMovers} registered`} icon={Truck} tone="blue" onClick={() => router.push("/fleet")} />
        <StatCard label="Registered Drivers" value={stats.registeredDrivers} hint={`${stats.activeDrivers} active`} icon={Users} tone="navy" onClick={() => router.push("/drivers")} />
        <StatCard label="Containers Transported" value={stats.containers} hint={`Today · ${stats.containers20} x 20FT, ${stats.containers40} x 40FT`} icon={Container} tone="green" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <div className="lg:col-span-2">
          <MovementChart data={trend} />
        </div>
        <TerminalChart data={tStats} />
        <ContainerChart data={dist} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <RecentMovements movements={recent} />
        </div>
        <QuickActions />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <RecentExceptions />
        <ImportActivity />
        <TerminalPerformance stats={tStats} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FleetStatus rows={fleet} />
        </div>
        <FleetChart active={util.active} maintenance={util.maintenance} inactive={util.inactive} />
      </div>
      <p className="mt-4 text-xs text-slate">Journeys and container units are counted separately: a trailer carrying two 20FT containers is one journey and two container units.</p>
    </div>
  );
}
