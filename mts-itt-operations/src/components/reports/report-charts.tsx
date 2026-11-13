"use client";

import { useState, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/shared/empty-state";
import { SectionCard } from "@/components/shared/section-card";
import { NativeSelect } from "@/components/shared/native-select";
import { CHART_COLORS } from "@/lib/constants";
import type { AnalyticsData, ChartSpec } from "@/lib/reports";
import { cn, formatNumber } from "@/lib/utils";

const AXIS = { fontSize: 11, fill: "#64748B" };
const GRID = "#E2E8F0";
const tip = (v: unknown) => (typeof v === "number" ? formatNumber(v, Number.isInteger(v) ? 0 : 2) : String(v));

function NoData({ text = "No data for the selected filters" }: { text?: string }) {
  return <EmptyState title={text} description="Widen the date range or clear some filters." />;
}

const hasValues = (data: Record<string, string | number>[], keys: string[]) =>
  data.some((d) => keys.some((k) => Number(d[k]) > 0));

/** Chart for the currently selected report. */
export function ReportChart({ spec }: { spec: ChartSpec | null }) {
  if (!spec) return null;
  const keys = spec.series.map((s) => s.key);
  const crowded = spec.data.length > 7;
  return (
    <SectionCard title={spec.title} description="Based on the filtered report below">
      {!spec.data.length || !hasValues(spec.data, keys) ? (
        <NoData />
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={spec.data} margin={{ top: 8, right: 8, left: -12, bottom: crowded ? 24 : 4 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey={spec.xKey} tick={AXIS} interval={0} angle={crowded ? -30 : 0} textAnchor={crowded ? "end" : "middle"} height={crowded ? 60 : 30} />
              <YAxis tick={AXIS} allowDecimals={false} />
              <Tooltip formatter={tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {spec.series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} stackId={s.stackId} radius={s.stackId ? 0 : [3, 3, 0, 0]} maxBarSize={44} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
}

const TABS = [
  { key: "trend", label: "Movement trends" },
  { key: "terminals", label: "Terminal comparison" },
  { key: "drivers", label: "Driver performance" },
  { key: "vehicles", label: "Vehicle utilisation" },
  { key: "containers", label: "Container distribution" },
  { key: "fuel", label: "Fuel consumption" },
  { key: "revenue", label: "Revenue trends", financial: true },
  { key: "exceptions", label: "Exception trends" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function Panel({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
        {note && <span className="text-xs text-slate">{note}</span>}
      </div>
      {children}
    </div>
  );
}

const H = 300;

export function AnalyticsCharts({ data, canFinancial, currency }: { data: AnalyticsData; canFinancial: boolean; currency: string }) {
  const [tab, setTab] = useState<TabKey>("trend");
  const [fuelMode, setFuelMode] = useState<"month" | "vehicle">("month");
  const tabs = TABS.filter((t) => !("financial" in t) || canFinancial);
  const active = tabs.some((t) => t.key === tab) ? tab : "trend";
  const gran = data.granularity === "day" ? "operational day" : data.granularity === "week" ? "ISO week" : "month";

  let body: ReactNode = null;
  if (active === "trend") {
    body = (
      <Panel title="Journeys per period by status" note={`Grouped by ${gran} (07:00→07:00 operational days)`}>
        {!hasValues(data.trend, ["Completed", "Pending", "Rejected"]) ? (
          <NoData />
        ) : (
          <ResponsiveContainer width="100%" height={H}>
            <ComposedChart data={data.trend} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={14} />
              <YAxis yAxisId="l" tick={AXIS} allowDecimals={false} />
              <YAxis yAxisId="r" orientation="right" tick={AXIS} allowDecimals={false} />
              <Tooltip formatter={tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="l" dataKey="Completed" stackId="s" fill={CHART_COLORS.green} maxBarSize={32} />
              <Bar yAxisId="l" dataKey="Pending" name="Pending / in progress" stackId="s" fill={CHART_COLORS.orange} maxBarSize={32} />
              <Bar yAxisId="l" dataKey="Rejected" name="Rejected / damaged" stackId="s" fill={CHART_COLORS.red} maxBarSize={32} />
              <Line yAxisId="r" type="monotone" dataKey="Containers" name="Container units" stroke={CHART_COLORS.navy} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Panel>
    );
  } else if (active === "terminals") {
    body = (
      <Panel title="Terminal comparison" note="Journeys dispatched from / received at each terminal">
        {!data.terminals.length ? (
          <NoData />
        ) : (
          <ResponsiveContainer width="100%" height={H}>
            <BarChart data={data.terminals} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} />
              <YAxis tick={AXIS} allowDecimals={false} />
              <Tooltip formatter={tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Dispatched" fill={CHART_COLORS.blue} radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Bar dataKey="Received" fill={CHART_COLORS.green} radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Bar dataKey="Completed" fill={CHART_COLORS.navy} radius={[3, 3, 0, 0]} maxBarSize={40} />
              <Bar dataKey="Containers" name="Container units (dispatched)" fill={CHART_COLORS.orange} radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    );
  } else if (active === "drivers") {
    body = (
      <Panel title="Driver performance – top 10 by journeys" note="Completed vs other statuses">
        {!data.drivers.length ? (
          <NoData />
        ) : (
          <ResponsiveContainer width="100%" height={H}>
            <BarChart data={data.drivers} layout="vertical" margin={{ top: 4, right: 12, left: 24, bottom: 4 }}>
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={AXIS} allowDecimals={false} />
              <YAxis type="category" dataKey="label" tick={AXIS} width={110} />
              <Tooltip formatter={tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Completed" stackId="s" fill={CHART_COLORS.green} maxBarSize={22} />
              <Bar dataKey="Other" name="Other statuses" stackId="s" fill={CHART_COLORS.grey} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    );
  } else if (active === "vehicles") {
    body = (
      <Panel title="Vehicle utilisation" note="Journeys (bars) and % of elapsed days active (line)">
        {!hasValues(data.vehicles, ["Journeys"]) ? (
          <NoData />
        ) : (
          <ResponsiveContainer width="100%" height={H}>
            <ComposedChart data={data.vehicles} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} />
              <YAxis yAxisId="l" tick={AXIS} allowDecimals={false} />
              <YAxis yAxisId="r" orientation="right" tick={AXIS} domain={[0, 100]} unit="%" />
              <Tooltip formatter={tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="l" dataKey="Journeys" fill={CHART_COLORS.blue} radius={[3, 3, 0, 0]} maxBarSize={36} />
              <Line yAxisId="r" type="monotone" dataKey="Utilisation" name="Utilisation %" stroke={CHART_COLORS.orange} strokeWidth={2} dot />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Panel>
    );
  } else if (active === "containers") {
    const total = data.containers.reduce((s, c) => s + c.value, 0);
    body = (
      <Panel title="Container distribution" note="Container units by size (journeys shown in tooltip)">
        {!total ? (
          <NoData />
        ) : (
          <div className="grid items-center gap-4 sm:grid-cols-2">
            <ResponsiveContainer width="100%" height={H}>
              <PieChart>
                <Pie data={data.containers} dataKey="value" nameKey="name" innerRadius={62} outerRadius={105} paddingAngle={2} label={(p: { name?: string; value?: number }) => `${p.name} ${p.value}`}>
                  {data.containers.map((c, i) => (
                    <Cell key={c.name} fill={[CHART_COLORS.blue, CHART_COLORS.green][i]} />
                  ))}
                </Pie>
                <Tooltip formatter={tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              {data.containers.map((c) => (
                <div key={c.name} className="rounded-lg border p-3">
                  <dt className="text-xs font-medium uppercase tracking-wide text-slate">{c.name}</dt>
                  <dd className="text-xl font-semibold text-ink">{formatNumber(c.value)} units</dd>
                  <dd className="text-xs text-slate">{formatNumber(c.journeys)} journeys · {Math.round((c.value / total) * 100)}%</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </Panel>
    );
  } else if (active === "fuel") {
    const rows = fuelMode === "month" ? data.fuelByMonth : data.fuelByVehicle;
    body = (
      <Panel title="Fuel consumption (litres)" note="GPS, fuel-station and manual records kept separate – no double counting">
        <div className="mb-2 flex items-center gap-2 text-xs text-slate">
          <span>Group by</span>
          <NativeSelect className="w-36" value={fuelMode} onValueChange={(v) => setFuelMode(v as "month" | "vehicle")} options={[{ value: "month", label: "Month" }, { value: "vehicle", label: "Vehicle" }]} aria-label="Fuel chart grouping" />
        </div>
        {!hasValues(rows, ["GPS", "Invoice", "Manual"]) ? (
          <NoData text="No fuel records in range" />
        ) : (
          <ResponsiveContainer width="100%" height={H}>
            <BarChart data={rows} margin={{ top: 8, right: 8, left: -4, bottom: 4 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} />
              <YAxis tick={AXIS} />
              <Tooltip formatter={tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="GPS" name="GPS litres" fill={CHART_COLORS.blue} radius={[3, 3, 0, 0]} maxBarSize={32} />
              <Bar dataKey="Invoice" name="Fuel-station litres" fill={CHART_COLORS.green} radius={[3, 3, 0, 0]} maxBarSize={32} />
              <Bar dataKey="Manual" name="Manual litres" fill={CHART_COLORS.orange} radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    );
  } else if (active === "revenue" && canFinancial) {
    const inv = data.invoiceTotals ?? [];
    body = (
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={`Rate-card revenue (${currency})`} note={`Billable journeys x effective rates, by ${gran}`}>
          {!data.revenue || !hasValues(data.revenue, ["Base", "Diesel"]) ? (
            <NoData />
          ) : (
            <ResponsiveContainer width="100%" height={H}>
              <BarChart data={data.revenue} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={14} />
                <YAxis tick={AXIS} />
                <Tooltip formatter={tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Base" name="Base amount" stackId="s" fill={CHART_COLORS.navy} maxBarSize={36} />
                <Bar dataKey="Diesel" name="Diesel adjustment" stackId="s" fill={CHART_COLORS.orange} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
        <Panel title={`Invoice totals by billing month (${currency})`} note="Draft / pending vs approved / exported">
          {!hasValues(inv as unknown as Record<string, string | number>[], ["Draft", "Pending Approval", "Approved", "Exported"]) ? (
            <NoData text="No invoices in range" />
          ) : (
            <ResponsiveContainer width="100%" height={H}>
              <BarChart data={inv} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} />
                <YAxis tick={AXIS} />
                <Tooltip formatter={tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Draft" stackId="s" fill={CHART_COLORS.grey} maxBarSize={44} />
                <Bar dataKey="Pending Approval" stackId="s" fill={CHART_COLORS.orange} maxBarSize={44} />
                <Bar dataKey="Approved" stackId="s" fill={CHART_COLORS.green} maxBarSize={44} />
                <Bar dataKey="Exported" stackId="s" fill={CHART_COLORS.navy} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    );
  } else if (active === "exceptions") {
    body = (
      <Panel title="Exception trend" note={`Opened vs resolved / rejected per ${gran}`}>
        {!hasValues(data.exceptions, ["Opened", "Resolved"]) ? (
          <NoData text="No exceptions in range" />
        ) : (
          <ResponsiveContainer width="100%" height={H}>
            <LineChart data={data.exceptions} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={14} />
              <YAxis tick={AXIS} allowDecimals={false} />
              <Tooltip formatter={tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Opened" stroke={CHART_COLORS.red} strokeWidth={2} dot={data.exceptions.length < 20} />
              <Line type="monotone" dataKey="Resolved" stroke={CHART_COLORS.green} strokeWidth={2} dot={data.exceptions.length < 20} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Panel>
    );
  }

  return (
    <SectionCard
      title="Analytics charts"
      description="Follow the report filters above"
      actions={null}
    >
      <div role="tablist" aria-label="Analytics charts" className="scroll-thin -mx-1 mb-4 flex gap-1 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={active === t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition",
              active === t.key ? "border-navy bg-navy text-white" : "bg-card text-slate hover:border-brand/40 hover:text-ink",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="min-h-[340px]">{body}</div>
    </SectionCard>
  );
}
