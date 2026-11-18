"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, Banknote, BarChart3, CheckCircle2, Fuel, Gauge, Receipt, Route, Truck, UserCheck, Users, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { ShiftFilter, type ShiftValue } from "@/components/shared/shift-filter";
import { useApp } from "@/contexts/app-context";
import { CHART_COLORS } from "@/lib/constants";
import { demoToday, formatDay } from "@/lib/date-utils";
import { fuelReconSummary, reconcileFuel } from "@/lib/fuel-reconciliation";
import { buildIttAnalysis, periodRange, SOURCE_TERMINALS, type IttPeriod } from "@/lib/itt-analysis";
import { defaultFilters, filterMovements } from "@/lib/reports";
import { pendingPayRequests } from "@/lib/mutations/payment";
import { cn, formatMoney, formatNumber } from "@/lib/utils";
import { RecentExceptions } from "./recent-exceptions";
import { ImportActivity } from "./import-activity";

const AXIS = { fontSize: 11, fill: "#64748B" };
const GRID = "#E2E8F0";
const PIE = [CHART_COLORS.navy, CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.orange, CHART_COLORS.grey];
const tip = (v: unknown) => (typeof v === "number" ? formatNumber(v, Number.isInteger(v) ? 0 : 2) : String(v));
const PERIODS: { key: IttPeriod; label: string }[] = [
  { key: "daily", label: "Today" },
  { key: "weekly", label: "This week" },
  { key: "monthly", label: "This month" },
];

/** The CEO's super dashboard: trips, revenue, money owed and approvals, fleet, fuel and exceptions in one place. */
export function CeoDashboard() {
  const { db } = useApp();
  const router = useRouter();
  const today = demoToday();
  const [kind, setKind] = useState<IttPeriod>("monthly");
  const [shift, setShift] = useState<ShiftValue>("");
  const { from, to } = useMemo(() => periodRange(kind, today), [kind, today]);
  const d = useMemo(() => buildIttAnalysis(db, from, to, true, "SAGT", shift), [db, from, to, shift]);
  const money = (n: number) => formatMoney(n, db.settings.currency);

  const inPeriod = d.totalTrips;
  const doneInPeriod = useMemo(() => filterMovements(db, { ...defaultFilters(), from, to, shift }).filter((i) => i.m.status === "Completed").length, [db, from, to, shift]);

  const openEx = db.exceptions.filter((e) => e.status === "Open" || e.status === "Under Review");
  const critical = openEx.filter((e) => e.priority === "Critical" || e.priority === "High").length;
  const invoicesOut = db.invoices.filter((i) => i.status === "Draft" || i.status === "Pending Approval");
  const invoiceOutTotal = invoicesOut.reduce((s, i) => s + i.finalAmount, 0);
  const invoiceApproved = db.invoices.filter((i) => i.status === "Approved" || i.status === "Exported").reduce((s, i) => s + i.finalAmount, 0);
  const payPending = pendingPayRequests(db);
  const payPendingTotal = payPending.reduce((s, r) => s + r.total, 0);
  const fuelFlag = useMemo(() => fuelReconSummary(reconcileFuel(db)), [db]);
  const onDutyToday = db.roster.filter((r) => r.date === today && (shift ? r.shift === shift : ["Morning", "Night"].includes(r.shift)) && r.attendance !== "Absent").length;
  const activePM = db.primeMovers.filter((p) => p.status === "Active").length;

  const revenueByTerminal = SOURCE_TERMINALS.map((t) => ({ name: t, Revenue: Math.round(d.revenue?.bySource[t] ?? 0) }));
  const topVehicles = [...d.vehicles].sort((a, b) => b.trips - a.trips).slice(0, 8);
  const periodLabel = from === to ? formatDay(from, "EEE dd MMM yyyy") : `${formatDay(from, "dd MMM")} – ${formatDay(to, "dd MMM yyyy")}`;

  return (
    <div>
      <PageHeader
        title="Executive Dashboard"
        description={`Whole-business overview · operational days (07:00 → 07:00) · ${periodLabel}`}
        actions={
          <Button render={<Link href="/reports" />}>
            <BarChart3 /> Open reports
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex w-fit overflow-hidden rounded-lg border text-sm">
          {PERIODS.map((p) => (
            <button key={p.key} type="button" aria-pressed={kind === p.key} onClick={() => setKind(p.key)} className={cn("px-4 py-2 font-medium", kind === p.key ? "bg-navy text-white" : "bg-card text-slate hover:bg-muted")}>
              {p.label}
            </button>
          ))}
        </div>
        <ShiftFilter value={shift} onChange={setShift} />
      </div>

      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate">Business · {periodLabel}{shift ? ` · ${shift} shift` : ""}</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue (billable)" value={money(d.revenue?.total ?? 0)} hint={`${money(d.revenue?.dailyAvg ?? 0)} / day`} icon={Banknote} tone="green" onClick={() => router.push("/reports")} />
        <StatCard label="Trips" value={formatNumber(inPeriod)} hint={`CWIT ${d.bySource.CWIT ?? 0} · SAGT ${d.bySource.SAGT ?? 0} · CICT ${d.bySource.CICT ?? 0}`} icon={Route} tone="navy" />
        <StatCard label="Completed" value={inPeriod ? `${Math.round((doneInPeriod / inPeriod) * 100)}%` : "—"} hint={`${doneInPeriod} of ${inPeriod} trips`} icon={CheckCircle2} tone="green" />
        <StatCard label="Avg trips / truck / day" value={formatNumber(d.avgTripsPerVehicleDay, 2)} hint={`${d.vehiclesUsed} trucks used`} icon={Gauge} tone="blue" />
      </div>

      <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate">Money & approvals</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Invoices outstanding" value={money(invoiceOutTotal)} hint={`${invoicesOut.length} draft / awaiting approval`} icon={Receipt} tone="orange" />
        <StatCard label="Invoices approved" value={money(invoiceApproved)} hint="Approved or exported" icon={Wallet} tone="green" />
        <StatCard label="Driver pay awaiting approval" value={payPending.length} hint={payPending.length ? `${money(payPendingTotal)} payable` : "Nothing waiting"} icon={Users} tone={payPending.length ? "orange" : "grey"} />
        <StatCard label="Fuel variance flags" value={fuelFlag.flagged} hint={`${fuelFlag.pendingReview} pending review`} icon={Fuel} tone={fuelFlag.flagged ? "red" : "green"} onClick={() => router.push("/reports")} />
      </div>

      <h2 className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-slate">Operations right now</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Open exceptions" value={openEx.length} hint={`${critical} high / critical`} icon={AlertTriangle} tone={openEx.length ? "red" : "green"} />
        <StatCard label="Active trucks" value={activePM} hint={`of ${db.primeMovers.length} registered`} icon={Truck} tone="blue" />
        <StatCard label="Drivers on duty today" value={onDutyToday} hint={`${db.drivers.filter((x) => x.status === "Active").length} active drivers`} icon={UserCheck} tone="navy" />
        <StatCard label="Fuel efficiency" value={d.fuel.kmPerLitreRefuel ? `${formatNumber(d.fuel.kmPerLitreRefuel, 2)} km/L` : "—"} hint="GPS km ÷ fuel-station litres" icon={Fuel} tone="navy" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="Trips per day" description="By pickup terminal">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.daily} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={10} />
                <YAxis tick={AXIS} allowDecimals={false} />
                <Tooltip formatter={tip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="CWIT" stackId="a" fill={CHART_COLORS.blue} maxBarSize={30} />
                <Bar dataKey="SAGT" stackId="a" fill={CHART_COLORS.green} maxBarSize={30} />
                <Bar dataKey="CICT" stackId="a" fill={CHART_COLORS.orange} maxBarSize={30} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title="Revenue by pickup terminal" description={`Billable movements at the rate card (${db.settings.currency})`}>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueByTerminal} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="name" tick={AXIS} />
                <YAxis tick={AXIS} />
                <Tooltip formatter={tip} />
                <Bar dataKey="Revenue" fill={CHART_COLORS.green} maxBarSize={56} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title="Busiest trucks" description="Trips in the period">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topVehicles} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
                <CartesianGrid stroke={GRID} horizontal={false} />
                <XAxis type="number" tick={AXIS} allowDecimals={false} />
                <YAxis type="category" dataKey="regNo" tick={AXIS} width={60} />
                <Tooltip formatter={tip} />
                <Bar dataKey="trips" name="Trips" fill={CHART_COLORS.navy} maxBarSize={16} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
        <SectionCard title="Container mix" description="Journeys by container size">
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={d.size.map((s) => ({ name: s.name, value: s.journeys }))} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} paddingAngle={2} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`} fontSize={11}>
                  {d.size.map((_, i) => (
                    <Cell key={i} fill={PIE[i % PIE.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={tip} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <RecentExceptions />
        <ImportActivity />
      </div>
      <p className="mt-4 text-xs text-slate">{shift ? `The shift filter applies to trips, revenue, trucks and drivers on duty; invoices, driver pay, exceptions and fuel-station/GPS figures are not split by shift. ` : ""}Revenue counts only Billable movements (verified chits, driver log verified, no open exceptions). The full set of reports, including the MTS ITT analysis, is under Reports.</p>
    </div>
  );
}
