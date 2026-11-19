"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Banknote, Fuel, Route, Wrench } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { CHART_COLORS } from "@/lib/constants";
import { addDays, demoToday, formatDate, formatDay, monthRange } from "@/lib/date-utils";
import { vehicleCosts, type MonthCost } from "@/lib/vehicle-costs";
import { cn, formatMoney, formatNumber } from "@/lib/utils";

const AXIS = { fontSize: 11, fill: "#64748B" };

/** "How much does MTS spend on this truck": fuel and maintenance for a chosen period, last fill-up and last service. */
export function VehicleCosts({ vehicleId }: { vehicleId: string }) {
  const { db } = useApp();
  const { canSeeFinancials } = useAuth();
  const today = demoToday();
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const money = (n: number) => formatMoney(n, db.settings.currency);

  const presets = useMemo(() => {
    const dates = [...db.fuelRecords.filter((r) => r.vehicleId === vehicleId).map((r) => r.date), ...db.serviceRecords.filter((s) => s.vehicleId === vehicleId).map((s) => s.date)].sort();
    const earliest = dates[0] ?? addDays(today, -365);
    return [
      { key: "30", label: "Last 30 days", from: addDays(today, -30), to: today },
      { key: "month", label: "This month", ...monthRange(today.slice(0, 7)) },
      { key: "90", label: "Last 90 days", from: addDays(today, -90), to: today },
      { key: "all", label: "All time", from: earliest, to: today },
    ];
  }, [db.fuelRecords, db.serviceRecords, vehicleId, today]);

  const valid = !!from && !!to && from <= to;
  const c = useMemo(() => vehicleCosts(db, vehicleId, valid ? from : to, to), [db, vehicleId, from, to, valid]);
  const lastFuelDays = c.lastFuel ? Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${c.lastFuel.date}T00:00:00Z`)) / 86400000) : null;

  const monthCols: Column<MonthCost>[] = [
    { key: "m", header: "Month", sortValue: (r) => r.month, cell: (r) => <span className="font-medium text-ink">{formatDay(`${r.month}-01`, "MMMM yyyy")}</span> },
    { key: "l", header: "Fuel (litres)", align: "right", sortValue: (r) => r.litres, cell: (r) => formatNumber(r.litres, 1) },
    { key: "f", header: "Fuel cost", align: "right", sortValue: (r) => r.fuel, cell: (r) => money(r.fuel) },
    { key: "mt", header: "Maintenance", align: "right", sortValue: (r) => r.maintenance, cell: (r) => money(r.maintenance) },
    { key: "t", header: "Total spend", align: "right", sortValue: (r) => r.total, cell: (r) => <span className="font-semibold">{money(r.total)}</span> },
  ];

  if (!canSeeFinancials) {
    return (
      <SectionCard title="Fuel & maintenance spend">
        <p className="text-sm text-slate">Cost information is restricted to finance roles.</p>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard title="Fuel & maintenance spend" description="What MTS has spent on this vehicle in the period (fuel-station invoices and manual fuel entries, plus completed service logs)">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const active = from === p.from && to === p.to;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  setFrom(p.from);
                  setTo(p.to);
                }}
                className={cn("rounded-full border px-3 py-1 text-xs font-medium transition", active ? "border-brand bg-brand/10 text-brand" : "bg-card text-slate hover:border-brand/40 hover:text-ink")}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From" error={valid ? undefined : "Start is after end"}>
            <Input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className="h-8 w-40" aria-label="From date" />
          </Field>
          <Field label="To">
            <Input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className="h-8 w-40" aria-label="To date" />
          </Field>
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total spend" value={money(c.total)} icon={Banknote} tone="navy" hint={`${formatDate(from)} – ${formatDate(to)}`} />
        <StatCard label="Fuel cost" value={money(c.fuelCost)} icon={Fuel} tone="orange" hint={`${formatNumber(c.fuelLitres, 1)} L in ${c.fills} fill-up${c.fills === 1 ? "" : "s"}`} />
        <StatCard label="Maintenance cost" value={money(c.maintenanceCost)} icon={Wrench} tone="blue" hint={`${c.services} completed service${c.services === 1 ? "" : "s"}`} />
        <StatCard label="Spend per trip" value={c.costPerTrip === null ? "—" : money(c.costPerTrip)} icon={Route} tone="green" hint={`${c.trips} trip${c.trips === 1 ? "" : "s"} in the period`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Last fuel pumped" description="Latest fuel-station invoice or manual entry (all time)">
          {c.lastFuel ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Item label="Date">
                {formatDate(c.lastFuel.date)}
                {lastFuelDays !== null && <span className="ml-1 text-xs text-slate">({lastFuelDays === 0 ? "today" : `${lastFuelDays} day${lastFuelDays === 1 ? "" : "s"} ago`})</span>}
              </Item>
              <Item label="Litres">{formatNumber(c.lastFuel.litres, 1)} L</Item>
              <Item label="Cost">{c.lastFuel.amount !== undefined ? money(c.lastFuel.amount) : "—"}</Item>
              <Item label="Price per litre">{c.lastFuel.amount !== undefined && c.lastFuel.litres ? money(c.lastFuel.amount / c.lastFuel.litres) : "—"}</Item>
              <Item label="Station" className="col-span-2">{c.lastFuel.station ?? "—"}</Item>
              <Item label="Invoice">{c.lastFuel.invoiceNo ?? "—"}</Item>
              <Item label="Source">{c.lastFuel.source}</Item>
            </dl>
          ) : (
            <p className="text-sm text-slate">No fuel-station invoice or manual fuel entry has been recorded for this vehicle yet.</p>
          )}
        </SectionCard>
        <SectionCard title="Maintenance" description="Latest completed service and anything still open">
          {c.lastService ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Item label="Last service">{formatDate(c.lastService.date)}</Item>
              <Item label="Cost">{money(c.lastService.cost)}</Item>
              <Item label="Type">{c.lastService.serviceType}</Item>
              <Item label="Next service due">{formatDate(c.lastService.nextServiceDate)}</Item>
              <Item label="Work done" className="col-span-2">{c.lastService.description}</Item>
            </dl>
          ) : (
            <p className="text-sm text-slate">No completed service has been logged for this vehicle yet.</p>
          )}
          {c.openServices.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t pt-3 text-xs">
              {c.openServices.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="font-medium text-ink">{s.serviceType}</span> · {formatDate(s.date)} · {s.description}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {s.cost > 0 && <span className="text-slate">est. {money(s.cost)}</span>}
                    <StatusBadge status={s.status === "Overdue" ? "Overdue" : "Scheduled"} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Spend by month" description="Fuel and maintenance" bodyClassName="p-0">
        <div className="h-56 w-full px-2 pt-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={c.monthly.map((m) => ({ name: formatDay(`${m.month}-01`, "MMM yy"), Fuel: m.fuel, Maintenance: m.maintenance }))} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="name" tick={AXIS} />
              <YAxis tick={AXIS} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
              <Tooltip formatter={(v) => (typeof v === "number" ? money(v) : String(v))} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="Fuel" stackId="a" fill={CHART_COLORS.orange} maxBarSize={48} />
              <Bar dataKey="Maintenance" stackId="a" fill={CHART_COLORS.blue} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <DataTable columns={monthCols} rows={c.monthly} getRowId={(r) => r.month} initialSort={{ key: "m", dir: "desc" }} pageSize={6} hidePagerIfSinglePage emptyTitle="No spend in this period" />
      </SectionCard>
      <p className="text-xs text-slate">
        Fuel cost counts fuel-station invoices and manual entries; GPS rows are estimated litres with no price and are not counted. Only completed service logs count as maintenance spend; scheduled or overdue work is shown as an estimate until it is completed.
      </p>
    </div>
  );
}

function Item({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-slate">{label}</dt>
      <dd className="font-medium text-ink">{children}</dd>
    </div>
  );
}
