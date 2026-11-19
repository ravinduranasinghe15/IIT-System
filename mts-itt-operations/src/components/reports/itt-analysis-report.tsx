"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { CHART_COLORS } from "@/lib/constants";
import { demoToday, formatDate } from "@/lib/date-utils";
import { downloadBlob } from "@/lib/export-utils";
import { ShiftFilter, type ShiftValue } from "@/components/shared/shift-filter";
import { buildIttAnalysis, periodRange, SOURCE_TERMINALS, type IttPeriod } from "@/lib/itt-analysis";
import { cn, formatMoney, formatNumber } from "@/lib/utils";
import type { TerminalCode } from "@/types/terminal";

const AXIS = { fontSize: 11, fill: "#64748B" };
const GRID = "var(--chart-grid)";
const PIE = [CHART_COLORS.navy, CHART_COLORS.blue, CHART_COLORS.green, CHART_COLORS.orange, CHART_COLORS.grey, CHART_COLORS.red];
const PERIODS: { key: IttPeriod; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "custom", label: "Custom range" },
];
const tip = (v: unknown) => (typeof v === "number" ? formatNumber(v, Number.isInteger(v) ? 0 : 2) : String(v));
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function ChartCard({ title, note, children, className }: { title: string; note?: string; children: ReactNode; className?: string }) {
  return (
    <div data-chart={title} className={cn("rounded-xl border bg-card p-3 shadow-sm", className)}>
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-navy">{title}</h3>
        {note && <span className="text-[11px] text-slate">{note}</span>}
      </div>
      {children}
    </div>
  );
}

const Donut = ({ data, h = 190 }: { data: { name: string; value: number }[]; h?: number }) =>
  data.length === 0 ? (
    <div className="flex h-[190px] items-center justify-center text-xs text-slate">No trips</div>
  ) : (
    <ResponsiveContainer width="100%" height={h}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(1)}%`} labelLine={false} fontSize={11}>
          {data.map((_, i) => (
            <Cell key={i} fill={PIE[i % PIE.length]} />
          ))}
        </Pie>
        <Tooltip formatter={tip} />
      </PieChart>
    </ResponsiveContainer>
  );

export function IttAnalysisReport() {
  const { db } = useApp();
  const { role } = useAuth();
  const canFinancial = role === "Manager" || role === "CEO";
  const today = demoToday();
  const [kind, setKind] = useState<IttPeriod>("weekly");
  const [anchor, setAnchor] = useState(today);
  const [custom, setCustom] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const [focus, setFocus] = useState<TerminalCode>("SAGT");
  const [shift, setShift] = useState<ShiftValue>("");
  const ref = useRef<HTMLDivElement>(null);

  const { from, to } = useMemo(() => periodRange(kind, anchor, custom), [kind, anchor, custom]);
  const d = useMemo(() => buildIttAnalysis(db, from, to, canFinancial, focus, shift), [db, from, to, canFinancial, focus, shift]);
  const currency = db.settings.currency;
  const money = (n: number) => formatMoney(n, currency);
  const title = `${kind === "daily" ? "Daily" : kind === "weekly" ? "Weekly" : kind === "monthly" ? "Monthly" : "Period"} Analysis Report - ITT (MTS) ${from}${to !== from ? ` / ${to.slice(8)}` : ""} (7-7) Time${shift ? ` - ${shift} shift (${shift === "Morning" ? "7am-7pm" : "7pm-7am"})` : ""}`;
  const periodLabel = from === to ? formatDate(from) : `${formatDate(from)} – ${formatDate(to)}`;
  const base = `mts-itt-analysis_${kind}_${from}${to !== from ? `_to_${to}` : ""}${shift ? `_${shift.toLowerCase()}` : ""}`;
  const empty = d.totalTrips === 0;

  const kpis: { label: string; value: string; hint?: string }[] = [
    ...SOURCE_TERMINALS.map((t) => ({ label: `Trip count (${t})`, value: formatNumber(d.bySource[t] ?? 0) })),
    { label: "Total trip count", value: formatNumber(d.totalTrips), hint: `${d.days} operational day${d.days === 1 ? "" : "s"}` },
    { label: "Avg trips / vehicle / day", value: formatNumber(d.avgTripsPerVehicleDay, 2), hint: `${d.vehiclesUsed} vehicles used` },
    { label: "Fuel efficiency (refuel)", value: d.fuel.kmPerLitreRefuel ? `${formatNumber(d.fuel.kmPerLitreRefuel, 2)} km/L` : "—", hint: "GPS km ÷ fuel-station litres" },
    { label: "Fuel efficiency (GPS)", value: d.fuel.kmPerLitreGps ? `${formatNumber(d.fuel.kmPerLitreGps, 2)} km/L` : "—", hint: "GPS km ÷ GPS-estimated litres" },
  ];
  if (d.revenue) {
    for (const t of SOURCE_TERMINALS) kpis.push({ label: `ITT revenue (${t})`, value: money(d.revenue.bySource[t] ?? 0) });
    kpis.push({ label: "Total ITT revenue", value: money(d.revenue.total), hint: d.revenue.unrated ? `${d.revenue.unrated} billable trip(s) have no rate` : "Billable movements, rate card" });
    kpis.push({ label: "Daily avg revenue", value: money(d.revenue.dailyAvg) });
  }

  /* ------------------------------------------------------------ exports */
  const xlsx = () => {
    const wb = XLSX.utils.book_new();
    const summary: (string | number)[][] = [["MTS ITT Operations – " + title], ["Period (operational days)", periodLabel], ["Generated", new Date().toLocaleString("en-GB")], [], ...kpis.map((k) => [k.label, k.value])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.daily.map((r) => ({ Date: r.date, "Total trips": r.Trips, "Unique vehicles": r.Vehicles, CWIT: r.CWIT, SAGT: r.SAGT, CICT: r.CICT }))), "Per day");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        d.vehicles.map((v) => ({
          Vehicle: v.regNo,
          Trips: v.trips,
          "Avg trips/day (7-7)": v.perDay,
          "Avg trips/12h shift": v.perShift,
          "20FT trips": v.c20,
          "40FT trips": v.c40,
          "GPS km": v.gpsKm,
          "GPS litres (est.)": v.gpsLitres,
          "Refuel litres": v.refuelLitres,
          ...(canFinancial ? { "Refuel cost": v.refuelCost } : {}),
          "km/L (refuel)": v.kmPerLitreRefuel,
          "km/L (GPS)": v.kmPerLitreGps,
        })),
      ),
      "Vehicles",
    );
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(d.drivers.map((r) => ({ Driver: r.name, Type: r.permanent ? "Permanent" : "Temporary", Trips: r.trips, Shifts: r.shifts, "Avg trips/shift": r.perShift }))), "Drivers");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(SOURCE_TERMINALS.flatMap((s) => (d.dropBySource[s] ?? []).map((x) => ({ "Pickup terminal": s, "Drop-off terminal": x.name, Trips: x.value })))),
      "Routes",
    );
    downloadBlob(new Blob([XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer], { type: "application/octet-stream" }), `${base}.xlsx`);
    toast.success("ITT analysis downloaded as Excel", { description: periodLabel });
  };

  /** PDF: a clean print view with the KPI cards, the charts (as drawn on screen) and the tables. */
  const pdf = () => {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Pop-up blocked", { description: "Allow pop-ups for this site to open the printable report." });
      return;
    }
    const charts = Array.from(ref.current?.querySelectorAll<HTMLElement>("[data-chart]") ?? [])
      .map((el) => {
        const svg = el.querySelector("svg.recharts-surface");
        let draw = "";
        if (svg) {
          const c = svg.cloneNode(true) as SVGElement;
          const wd = c.getAttribute("width");
          const ht = c.getAttribute("height");
          if (wd && ht && !wd.includes("%")) c.setAttribute("viewBox", `0 0 ${wd} ${ht}`);
          c.removeAttribute("width");
          c.removeAttribute("height");
          c.setAttribute("style", "width:100%;height:auto");
          draw = c.outerHTML;
        }
        return `<div class="chart"><div class="ct">${esc(el.getAttribute("data-chart") ?? "")}</div>${draw}</div>`;
      })
      .join("");
    const cards = kpis.map((k) => `<div class="card"><div class="k">${esc(k.label)}</div><div class="v">${esc(k.value)}</div></div>`).join("");
    const vTable = `<table><thead><tr><th>Vehicle</th><th class="r">Trips</th><th class="r">Avg/day</th><th class="r">Avg/shift</th><th class="r">20FT</th><th class="r">40FT</th><th class="r">GPS km</th><th class="r">Refuel L</th>${canFinancial ? '<th class="r">Refuel cost</th>' : ""}<th class="r">km/L</th></tr></thead><tbody>${d.vehicles
      .map((v) => `<tr><td>${esc(v.regNo)}</td><td class="r">${v.trips}</td><td class="r">${v.perDay}</td><td class="r">${v.perShift}</td><td class="r">${v.c20}</td><td class="r">${v.c40}</td><td class="r">${formatNumber(v.gpsKm, 1)}</td><td class="r">${formatNumber(v.refuelLitres, 1)}</td>${canFinancial ? `<td class="r">${formatNumber(v.refuelCost)}</td>` : ""}<td class="r">${v.kmPerLitreRefuel ?? "—"}</td></tr>`)
      .join("")}</tbody></table>`;
    const dTable = `<table><thead><tr><th>Driver</th><th>Type</th><th class="r">Trips</th><th class="r">Shifts</th><th class="r">Avg/shift</th></tr></thead><tbody>${d.drivers
      .map((r) => `<tr><td>${esc(r.name)}</td><td>${r.permanent ? "Permanent" : "Temporary"}</td><td class="r">${r.trips}</td><td class="r">${r.shifts}</td><td class="r">${r.perShift}</td></tr>`)
      .join("")}</tbody></table>`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
 body{font-family:Arial,Helvetica,sans-serif;color:#1e293b;margin:20px;font-size:11px}
 h1{font-size:18px;margin:0;color:#142c4c}.sub{color:#64748b;margin:2px 0 10px}
 h2{font-size:13px;color:#142c4c;margin:14px 0 6px}
 .cards{display:flex;flex-wrap:wrap;gap:6px}.card{border:1px solid #cbd5e1;border-radius:6px;padding:5px 9px;min-width:112px}
 .k{color:#64748b;font-size:9px;text-transform:uppercase}.v{font-size:14px;font-weight:bold}
 .charts{display:grid;grid-template-columns:1fr 1fr;gap:8px}.chart{border:1px solid #e2e8f0;border-radius:6px;padding:6px;break-inside:avoid}.ct{font-weight:bold;color:#142c4c;margin-bottom:2px}
 table{border-collapse:collapse;width:100%;margin-top:4px}th,td{border:1px solid #cbd5e1;padding:3px 5px;text-align:left}th{background:#142c4c;color:#fff;font-size:10px}
 td.r,th.r{text-align:right}tr:nth-child(even) td{background:#f8fafc}
 @media print{body{margin:8mm}@page{size:A4 landscape}}
</style></head><body>
<h1>${esc(title)}</h1><div class="sub">MTS ITT Operations · ${esc(periodLabel)} · ${d.days} operational day(s) · generated ${esc(new Date().toLocaleString("en-GB"))}</div>
<div class="cards">${cards}</div>
<h2>Charts</h2><div class="charts">${charts}</div>
<h2>Vehicles</h2>${vTable}
<h2>Drivers</h2>${dTable}
<script>window.onload=function(){setTimeout(function(){window.print()},400)}</script></body></html>`);
    w.document.close();
    toast.success("ITT analysis opened as a printable PDF view");
  };

  const permTrips = d.permanent.trips + d.temporary.trips;
  const pct = (n: number, t: number) => (t ? `${((n / t) * 100).toFixed(1)}%` : "0%");

  return (
    <div className="space-y-4">
      <SectionCard
        title="ITT analysis report (MTS format)"
        description="The weekly dashboard MTS circulates, generated from this system for any day, week, month or custom range."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button size="sm" disabled={empty} />}>
              <Download /> Download report
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={xlsx}>
                <FileSpreadsheet /> Excel (.xlsx) – summary, per day, vehicles, drivers, routes
              </DropdownMenuItem>
              <DropdownMenuItem onClick={pdf}>
                <Printer /> PDF (print view with charts)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex overflow-hidden rounded-lg border text-xs">
            {PERIODS.map((p) => (
              <button key={p.key} type="button" aria-pressed={kind === p.key} onClick={() => setKind(p.key)} className={cn("px-3 py-2 font-medium", kind === p.key ? "bg-navy text-white" : "bg-card text-slate hover:bg-muted")}>
                {p.label}
              </button>
            ))}
          </div>
          {kind === "monthly" ? (
            <Field label="Month">
              <Input type="month" value={anchor.slice(0, 7)} onChange={(e) => e.target.value && setAnchor(`${e.target.value}-15`)} className="h-8 w-44" />
            </Field>
          ) : kind === "custom" ? (
            <>
              <Field label="From">
                <Input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="h-8 w-40" />
              </Field>
              <Field label="To">
                <Input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="h-8 w-40" />
              </Field>
            </>
          ) : (
            <Field label={kind === "daily" ? "Operational day" : "Any day in the week (Mon–Sun)"}>
              <Input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className="h-8 w-44" />
            </Field>
          )}
          <Field label="Pickup / drop-off terminal">
            <NativeSelect value={focus} onValueChange={(v) => setFocus(v as TerminalCode)} options={SOURCE_TERMINALS} className="w-32" />
          </Field>
          <Field label="Shift">
            <ShiftFilter value={shift} onChange={setShift} />
          </Field>
          <div className="pb-1 text-xs text-slate">
            <span className="font-medium text-navy">{periodLabel}</span> · 07:00 → 07:00 operational days
          </div>
          {shift && <div className="basis-full text-xs text-amber-700">Trips, revenue and drivers are for the {shift} shift only. GPS and fuel-station figures are recorded per truck per day, so they still cover the whole day.</div>}
        </div>
      </SectionCard>

      <div ref={ref} className="space-y-4">
        <div>
          <h2 className="text-base font-semibold text-navy">{title}</h2>
          <p className="text-xs text-slate">Trips are journeys (one per truck movement, excluding Pending). Revenue counts billable movements at the rate card.</p>
        </div>

        {empty ? (
          <EmptyState title="No movements in this period" description="Pick another day, week or month, or widen the custom range." />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {kpis.map((k) => (
                <StatCard key={k.label} label={k.label} value={k.value} hint={k.hint} tone="navy" />
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Total trips per day" note="by pickup terminal">
                <ResponsiveContainer width="100%" height={260}>
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
              </ChartCard>
              <ChartCard title="Unique vehicles per day" note="trucks that moved at least one container">
                <ResponsiveContainer width="100%" height={260}>
                  <ComposedChart data={d.daily} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={10} />
                    <YAxis tick={AXIS} allowDecimals={false} />
                    <Tooltip formatter={tip} />
                    <Bar dataKey="Vehicles" fill={CHART_COLORS.navy} maxBarSize={30} />
                    <Line type="monotone" dataKey="Trips" stroke={CHART_COLORS.orange} strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title={`Loading vs discharge trips – ${focus}`} note="trips picked up at / dropped off at the terminal">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={d.flow} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={10} />
                    <YAxis tick={AXIS} allowDecimals={false} />
                    <Tooltip formatter={tip} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Pickup" name={`Loading ${focus} trips`} fill={CHART_COLORS.green} maxBarSize={22} />
                    <Bar dataKey="DropOff" name={`Discharge ${focus} trips`} fill={CHART_COLORS.blue} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Avg trips per vehicle" note="per operational day (7-7) and per 12-hour shift">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={d.vehicles} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} horizontal={false} />
                    <XAxis type="number" tick={AXIS} />
                    <YAxis type="category" dataKey="regNo" tick={AXIS} width={60} />
                    <Tooltip formatter={tip} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="perShift" name="Avg trips / 12h shift" fill={CHART_COLORS.green} maxBarSize={14} />
                    <Bar dataKey="perDay" name="Avg trips / day (7-7)" fill={CHART_COLORS.navy} maxBarSize={14} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="20 and 40 each vehicle" note="journeys by container size">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={d.vehicles} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="regNo" tick={AXIS} />
                    <YAxis tick={AXIS} allowDecimals={false} />
                    <Tooltip formatter={tip} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="c20" name="20FT" stackId="s" fill={CHART_COLORS.blue} maxBarSize={30} />
                    <Bar dataKey="c40" name="40FT" stackId="s" fill={CHART_COLORS.orange} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Total trips vs size" note="share of journeys">
                <Donut data={d.size.map((s) => ({ name: s.name, value: s.journeys }))} h={260} />
              </ChartCard>
              <ChartCard title="Permanent vs temporary drivers" note="temporary = a truck the driver did not mainly drive in this period">
                <Donut data={[{ name: "Permanent driver", value: d.permanent.trips }, { name: "Temporary driver", value: d.temporary.trips }].filter((x) => x.value > 0)} />
                <p className="text-center text-[11px] text-slate">
                  Trips: permanent {d.permanent.trips} ({pct(d.permanent.trips, permTrips)}) · temporary {d.temporary.trips} ({pct(d.temporary.trips, permTrips)})
                </p>
              </ChartCard>
              <ChartCard title="Permanent vs temporary shift count" note="driver-days worked">
                <Donut data={[{ name: "Permanent driver", value: d.permanent.shifts }, { name: "Temporary driver", value: d.temporary.shifts }].filter((x) => x.value > 0)} />
                <p className="text-center text-[11px] text-slate">
                  Shifts: permanent {d.permanent.shifts} · temporary {d.temporary.shifts} · drivers {d.permanent.drivers + d.temporary.drivers}
                </p>
              </ChartCard>
              <ChartCard title="Refuel cost" note={canFinancial ? `fuel-station invoices (${currency})` : "fuel-station litres (cost is restricted to finance roles)"}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={d.vehicles} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} horizontal={false} />
                    <XAxis type="number" tick={AXIS} />
                    <YAxis type="category" dataKey="regNo" tick={AXIS} width={60} />
                    <Tooltip formatter={tip} />
                    <Bar dataKey={canFinancial ? "refuelCost" : "refuelLitres"} name={canFinancial ? "Refuel cost" : "Refuel litres"} fill={CHART_COLORS.blue} maxBarSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Fuel per km" note="km per litre – higher is better">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={d.vehicles} margin={{ top: 8, right: 8, left: -14, bottom: 4 }}>
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis dataKey="regNo" tick={AXIS} />
                    <YAxis tick={AXIS} />
                    <Tooltip formatter={tip} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="kmPerLitreRefuel" name="km/L (refuel)" fill={CHART_COLORS.navy} maxBarSize={18} />
                    <Bar dataKey="kmPerLitreGps" name="km/L (GPS est.)" fill={CHART_COLORS.green} maxBarSize={18} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Total pickup trips" note="by pickup terminal">
                <Donut data={d.pickupShare} />
              </ChartCard>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {SOURCE_TERMINALS.map((t) => (
                <ChartCard key={t} title={`${t} drop-off trips`} note={`${d.bySource[t] ?? 0} trips from ${t}`}>
                  <Donut data={d.dropBySource[t] ?? []} />
                </ChartCard>
              ))}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <SectionCard title="Vehicles" description="Trips, shifts, fuel and efficiency per prime mover" bodyClassName="p-0">
                <div className="scroll-thin overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-slate">
                        <th className="px-3 py-2 font-medium">Vehicle</th>
                        <th className="px-3 py-2 text-right font-medium">Trips</th>
                        <th className="px-3 py-2 text-right font-medium">Avg/day</th>
                        <th className="px-3 py-2 text-right font-medium">Avg/shift</th>
                        <th className="px-3 py-2 text-right font-medium">Refuel L</th>
                        {canFinancial && <th className="px-3 py-2 text-right font-medium">Refuel cost</th>}
                        <th className="px-3 py-2 text-right font-medium">km/L</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.vehicles.map((v) => (
                        <tr key={v.id} className="border-b last:border-0">
                          <td className="px-3 py-1.5 font-medium text-ink">{v.regNo}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{v.trips}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{v.perDay}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{v.perShift}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(v.refuelLitres, 1)}</td>
                          {canFinancial && <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(v.refuelCost)}</td>}
                          <td className="px-3 py-1.5 text-right tabular-nums">{v.kmPerLitreRefuel ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
              <SectionCard title="Drivers" description="Trip count, shift count and average per shift" bodyClassName="p-0">
                <div className="scroll-thin max-h-96 overflow-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-slate">
                        <th className="px-3 py-2 font-medium">Driver</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 text-right font-medium">Trips</th>
                        <th className="px-3 py-2 text-right font-medium">Shifts</th>
                        <th className="px-3 py-2 text-right font-medium">Avg/shift</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.drivers.map((r) => (
                        <tr key={r.id} className="border-b last:border-0">
                          <td className="px-3 py-1.5 font-medium text-ink">{r.name}</td>
                          <td className="px-3 py-1.5 text-xs text-slate">{r.permanent ? "Permanent" : "Temporary"}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.trips}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.shifts}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{r.perShift}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </SectionCard>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
