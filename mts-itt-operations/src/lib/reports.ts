import type { DB } from "@/types/db";
import type { Movement, MovementStatus } from "@/types/movement";
import type { ContainerSize, TerminalCode } from "@/types/terminal";
import { addDays, daysBetween, demoToday, eachDay, formatDay, formatMonth, minutesBetween, operationalDay } from "./date-utils";
import { billableStatus, movementDay, payEligibility, unitsFor } from "./eligibility";
import { findRate } from "./invoice-calculator";
import { round2 } from "./payment-calculator";
import { formatMoney, formatNumber } from "./utils";
import { CHART_COLORS } from "./constants";

/* ------------------------------------------------------------------ types */

export type ReportType =
  | "daily"
  | "weekly"
  | "monthly"
  | "driver"
  | "vehicle"
  | "terminal"
  | "route"
  | "container"
  | "exception"
  | "payment"
  | "invoice"
  | "fuel";

export interface ReportFilters {
  from: string;
  to: string;
  terminal: "" | TerminalCode;
  driverId: string;
  vehicleId: string;
  /** "SOURCE-DEST", e.g. "CWIT-JCT" */
  route: string;
  size: "" | ContainerSize;
  status: "" | MovementStatus;
}
export type FilterKey = keyof ReportFilters;

export type Cell = string | number | null;
export type ReportRow = Record<string, Cell>;

export interface ReportColumn {
  key: string;
  label: string;
  kind: "text" | "int" | "dec" | "money" | "pct";
}

export interface SummaryItem {
  label: string;
  value: string;
  hint?: string;
}

export interface ChartSeries {
  key: string;
  name: string;
  color: string;
  stackId?: string;
}
export interface ChartSpec {
  title: string;
  kind: "bar" | "line";
  xKey: string;
  series: ChartSeries[];
  data: Record<string, string | number>[];
}

export interface ReportResult {
  columns: ReportColumn[];
  rows: ReportRow[];
  summary: SummaryItem[];
  chartData: ChartSpec | null;
  notes: string[];
}

export interface ReportMeta {
  type: ReportType;
  label: string;
  description: string;
  group: "Movement" | "Performance" | "Quality" | "Finance & Fuel";
  /** Whole report is financial: restricted to the CEO / Manager */
  financial: boolean;
  /** Filters that influence this report (others are disabled in the UI) */
  filters: FilterKey[];
}

const MOVEMENT_FILTERS: FilterKey[] = ["from", "to", "terminal", "driverId", "vehicleId", "route", "size", "status"];

export const REPORTS: ReportMeta[] = [
  { type: "daily", label: "Daily Movement", group: "Movement", financial: false, filters: MOVEMENT_FILTERS, description: "Journeys and container units per 07:00→07:00 operational day." },
  { type: "weekly", label: "Weekly Movement", group: "Movement", financial: false, filters: MOVEMENT_FILTERS, description: "ISO weeks (Mon–Sun) of operational days." },
  { type: "monthly", label: "Monthly Movement", group: "Movement", financial: false, filters: MOVEMENT_FILTERS, description: "Calendar months of operational days." },
  { type: "driver", label: "Driver Performance", group: "Performance", financial: false, filters: MOVEMENT_FILTERS, description: "Journeys, completion, turnaround and exceptions per driver." },
  { type: "vehicle", label: "Vehicle Performance", group: "Performance", financial: false, filters: MOVEMENT_FILTERS, description: "Utilisation, journeys, turnaround and GPS fuel per prime mover." },
  { type: "terminal", label: "Terminal Performance", group: "Performance", financial: false, filters: MOVEMENT_FILTERS, description: "Dispatched / received journeys, rejections and exception rate per terminal." },
  { type: "route", label: "Route Performance", group: "Performance", financial: false, filters: MOVEMENT_FILTERS, description: "Volume, completion and (finance) revenue per route." },
  { type: "container", label: "Container Distribution", group: "Movement", financial: false, filters: MOVEMENT_FILTERS, description: "20FT / 40FT mix, twin-20FT journeys and TEU." },
  { type: "exception", label: "Exception", group: "Quality", financial: false, filters: MOVEMENT_FILTERS, description: "Exceptions reported in the period with status, priority and age." },
  { type: "payment", label: "Driver Payment", group: "Finance & Fuel", financial: true, filters: ["from", "to", "driverId"], description: "Pay runs overlapping the period, per-driver lines (demo simulation)." },
  { type: "invoice", label: "Invoice", group: "Finance & Fuel", financial: true, filters: ["from", "to", "terminal", "route", "size"], description: "Terminal invoices by billing month, status and value." },
  { type: "fuel", label: "Fuel Reconciliation", group: "Finance & Fuel", financial: false, filters: ["from", "to", "vehicleId"], description: "GPS vs fuel-station litres per vehicle and month with variance flags." },
];

export const reportMeta = (t: ReportType) => REPORTS.find((r) => r.type === t) as ReportMeta;

export function defaultFilters(): ReportFilters {
  const today = demoToday();
  return { from: `${today.slice(0, 7)}-01`, to: today, terminal: "", driverId: "", vehicleId: "", route: "", size: "", status: "" };
}

export function routeOptions(db: DB) {
  const seen = new Set<string>();
  const out: { value: string; label: string }[] = [];
  for (const r of db.routes) {
    const v = `${r.source}-${r.destination}`;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push({ value: v, label: `${r.source} → ${r.destination}` });
  }
  return out;
}

/* --------------------------------------------------------- date bucketing */

export type Granularity = "day" | "week" | "month";

const dowMon = (day: string) => (new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7;
export const weekStart = (day: string) => addDays(day, -dowMon(day));

export function isoWeek(day: string): { year: number; week: number } {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7) + 3); // Thursday of this week
  const jan4 = new Date(Date.UTC(dt.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((dt.getTime() - jan4.getTime()) / 86_400_000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return { year: dt.getUTCFullYear(), week };
}

export const bucketKey = (day: string, g: Granularity) => (g === "day" ? day : g === "week" ? weekStart(day) : day.slice(0, 7));

export function bucketLabel(key: string, g: Granularity): string {
  if (g === "day") return formatDay(key, "dd MMM");
  if (g === "week") return `W${String(isoWeek(key).week).padStart(2, "0")} ${formatDay(key, "dd MMM")}`;
  return formatDay(`${key}-01`, "MMM yyyy");
}

export function bucketKeys(from: string, to: string, g: Granularity): string[] {
  if (from > to) return [];
  if (g === "day") return eachDay(from, to);
  const out: string[] = [];
  if (g === "week") {
    for (let d = weekStart(from); d <= to && out.length < 200; d = addDays(d, 7)) out.push(d);
    return out;
  }
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const end = to.slice(0, 7);
  for (let i = 0; i < 120; i++) {
    const k = `${y}-${String(m).padStart(2, "0")}`;
    if (k > end) break;
    out.push(k);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function autoGranularity(from: string, to: string): Granularity {
  const n = daysBetween(from, to) + 1;
  return n <= 31 ? "day" : n <= 120 ? "week" : "month";
}

/* ------------------------------------------------------------- aggregation */

interface MovementInfo {
  m: Movement;
  day: string;
}

function rangeValid(f: ReportFilters) {
  return !!f.from && !!f.to && f.from <= f.to;
}

/** Movements inside the date range (by operational day) matching every movement filter. */
export function filterMovements(db: DB, f: ReportFilters): MovementInfo[] {
  if (!rangeValid(f)) return [];
  const start = db.settings.opDayStartHour;
  const out: MovementInfo[] = [];
  for (const m of db.movements) {
    const day = movementDay(m, start);
    if (!day || day < f.from || day > f.to) continue;
    if (f.terminal && m.sourceTerminal !== f.terminal && m.destinationTerminal !== f.terminal) continue;
    if (f.driverId && m.driverId !== f.driverId) continue;
    if (f.vehicleId && m.primeMoverId !== f.vehicleId) continue;
    if (f.route && `${m.sourceTerminal}-${m.destinationTerminal}` !== f.route) continue;
    if (f.size && m.containerSize !== f.size) continue;
    if (f.status && m.status !== f.status) continue;
    out.push({ m, day });
  }
  return out;
}

interface Agg {
  movements: number;
  containers: number;
  c20: number;
  c40: number;
  twin: number;
  completed: number;
  pending: number;
  rejected: number;
  damaged: number;
  billable: number;
  billableUnits: number;
  turnSum: number;
  turnCount: number;
  days: Set<string>;
}

const newAgg = (): Agg => ({
  movements: 0,
  containers: 0,
  c20: 0,
  c40: 0,
  twin: 0,
  completed: 0,
  pending: 0,
  rejected: 0,
  damaged: 0,
  billable: 0,
  billableUnits: 0,
  turnSum: 0,
  turnCount: 0,
  days: new Set(),
});

function addTo(a: Agg, { m, day }: MovementInfo, db: DB) {
  const n = Math.max(1, m.containerNos.length);
  a.movements += 1;
  a.containers += n;
  if (m.containerSize === "20FT") {
    a.c20 += n;
    if (n >= 2) a.twin += 1;
  } else a.c40 += n;
  if (m.status === "Completed") a.completed += 1;
  else if (m.status === "Rejected") a.rejected += 1;
  else if (m.status === "Damaged") a.damaged += 1;
  else a.pending += 1;
  if (billableStatus(m, db) === "Billable") {
    a.billable += 1;
    a.billableUnits += unitsFor(m, db.settings.billingUnitMode);
  }
  if (m.status === "Completed" && m.loadingAt && m.dischargeAt) {
    const mins = minutesBetween(m.loadingAt, m.dischargeAt);
    if (mins > 0 && mins < 24 * 60) {
      a.turnSum += mins;
      a.turnCount += 1;
    }
  }
  a.days.add(day);
}

const avgTurn = (a: Agg): number | null => (a.turnCount ? Math.round(a.turnSum / a.turnCount) : null);
const pctOf = (n: number, d: number): number | null => (d ? round2((n / d) * 100) : null);

/** Revenue of one movement from effective-dated rate card (billable movements only). */
export function movementRevenue(m: Movement, db: DB): { base: number; diesel: number; total: number } | "unrated" | null {
  if (billableStatus(m, db) !== "Billable") return null;
  const day = movementDay(m, db.settings.opDayStartHour);
  if (!day) return null;
  const rate = findRate(db.rates, m.sourceTerminal, m.destinationTerminal, m.containerSize, day);
  if (!rate) return "unrated";
  const base = round2(unitsFor(m, db.settings.billingUnitMode) * rate.baseRate);
  const diesel = round2((base * rate.dieselAdjustmentPct) / 100);
  return { base, diesel, total: round2(base + diesel) };
}

const col = (key: string, label: string, kind: ReportColumn["kind"] = "text"): ReportColumn => ({ key, label, kind });
const fmtDur = (mins: number | null) => (mins === null ? "—" : `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`);

const EMPTY: ReportResult = { columns: [], rows: [], summary: [], chartData: null, notes: [] };

const JOURNEY_NOTE = "A movement is one physical journey; container units are counted separately (2 x 20FT on one trailer = 1 journey, 2 containers).";

/* --------------------------------------------------------- report builders */

function periodReport(type: "daily" | "weekly" | "monthly", f: ReportFilters, db: DB): ReportResult {
  const g: Granularity = type === "daily" ? "day" : type === "weekly" ? "week" : "month";
  const infos = filterMovements(db, f);
  const map = new Map<string, Agg>();
  for (const k of bucketKeys(f.from, f.to, g)) map.set(k, newAgg());
  for (const i of infos) {
    const bk = bucketKey(i.day, g);
    let a = map.get(bk);
    if (!a) {
      a = newAgg();
      map.set(bk, a);
    }
    addTo(a, i, db);
  }

  const periodLabel = type === "daily" ? "Operational day" : type === "weekly" ? "ISO week" : "Month";
  const columns: ReportColumn[] = [col("period", periodLabel)];
  if (type === "daily") columns.push(col("window", "Window"));
  if (type === "weekly") columns.push(col("span", "Operational days"));
  columns.push(
    col("movements", "Journeys", "int"),
    col("containers", "Container units", "int"),
    col("c20", "20FT units", "int"),
    col("c40", "40FT units", "int"),
    col("twin", "Twin-20FT journeys", "int"),
    col("completed", "Completed", "int"),
    col("pending", "Pending / in progress", "int"),
    col("rejected", "Rejected", "int"),
    col("damaged", "Damaged", "int"),
    col("billable", "Billable journeys", "int"),
    col("billableUnits", "Billable units", "int"),
    col("completion", "Completion %", "pct"),
  );

  const keys = [...map.keys()].sort();
  const rows: ReportRow[] = keys.map((k) => {
    const a = map.get(k) as Agg;
    const row: ReportRow = {
      id: k,
      period:
        type === "daily"
          ? formatDay(k, "EEE dd MMM yyyy")
          : type === "weekly"
            ? `${isoWeek(k).year}-W${String(isoWeek(k).week).padStart(2, "0")}`
            : formatMonth(k),
      movements: a.movements,
      containers: a.containers,
      c20: a.c20,
      c40: a.c40,
      twin: a.twin,
      completed: a.completed,
      pending: a.pending,
      rejected: a.rejected,
      damaged: a.damaged,
      billable: a.billable,
      billableUnits: a.billableUnits,
      completion: pctOf(a.completed, a.movements),
    };
    if (type === "daily") {
      const hh = `${String(db.settings.opDayStartHour).padStart(2, "0")}:00`;
      row.window = `${k} ${hh} → ${addDays(k, 1)} ${hh}`;
    }
    if (type === "weekly") {
      const e = addDays(k, 6);
      row.span = `${formatDay(k < f.from ? f.from : k, "dd MMM")} – ${formatDay(e > f.to ? f.to : e, "dd MMM")}`;
    }
    return row;
  });

  const tot = newAgg();
  for (const i of infos) addTo(tot, i, db);
  const active = rows.filter((r) => Number(r.movements) > 0).length;
  const notes = [JOURNEY_NOTE];
  if (type === "weekly") notes.push("Weeks run Monday–Sunday; weeks at the edge of the date range are partial.");
  if (type === "monthly") notes.push("Months are calendar months of the operational day, not of the raw timestamp.");

  return {
    columns,
    rows,
    notes,
    summary: [
      { label: "Journeys", value: formatNumber(tot.movements), hint: "physical truck journeys" },
      { label: "Container units", value: formatNumber(tot.containers), hint: `${formatNumber(tot.c20)} x 20FT · ${formatNumber(tot.c40)} x 40FT` },
      { label: "Completion", value: tot.movements ? `${pctOf(tot.completed, tot.movements)}%` : "—", hint: `${formatNumber(tot.completed)} completed` },
      { label: "Avg per active period", value: active ? formatNumber(tot.movements / active, 1) : "—", hint: `${active} active ${g === "day" ? "days" : g === "week" ? "weeks" : "months"}` },
    ],
    chartData: {
      title: `${periodLabel === "Operational day" ? "Daily" : periodLabel === "ISO week" ? "Weekly" : "Monthly"} journeys by status`,
      kind: "bar",
      xKey: "label",
      series: [
        { key: "Completed", name: "Completed", color: CHART_COLORS.green, stackId: "s" },
        { key: "Pending", name: "Pending / in progress", color: CHART_COLORS.orange, stackId: "s" },
        { key: "Rejected", name: "Rejected / damaged", color: CHART_COLORS.red, stackId: "s" },
      ],
      data: keys.map((k) => {
        const a = map.get(k) as Agg;
        return { label: bucketLabel(k, g), Completed: a.completed, Pending: a.pending, Rejected: a.rejected + a.damaged };
      }),
    },
  };
}

function driverReport(f: ReportFilters, db: DB): ReportResult {
  const infos = filterMovements(db, f);
  const ids = new Set(infos.map((i) => i.m.id));
  const exByMovement = new Map<string, number>();
  for (const e of db.exceptions) if (ids.has(e.movementId)) exByMovement.set(e.movementId, (exByMovement.get(e.movementId) ?? 0) + 1);

  const groups = new Map<string, { agg: Agg; infos: MovementInfo[] }>();
  for (const d of db.drivers) if (!f.driverId || d.id === f.driverId) groups.set(d.id, { agg: newAgg(), infos: [] });
  for (const i of infos) {
    const k = i.m.driverId ?? "UNASSIGNED";
    const g = groups.get(k) ?? { agg: newAgg(), infos: [] };
    addTo(g.agg, i, db);
    g.infos.push(i);
    groups.set(k, g);
  }
  const rows: ReportRow[] = [];
  for (const [id, g] of groups) {
    const d = db.drivers.find((x) => x.id === id);
    if (id === "UNASSIGNED" && !g.agg.movements) continue;
    const exc = g.infos.reduce((s, i) => s + (exByMovement.get(i.m.id) ?? 0), 0);
    const payable = g.infos.reduce((s, i) => s + (payEligibility(i.m, db).eligible ? unitsFor(i.m, db.settings.payUnitMode) : 0), 0);
    rows.push({
      id,
      driverId: id === "UNASSIGNED" ? "—" : id,
      name: d?.name ?? "Unassigned driver",
      status: d?.status ?? "—",
      movements: g.agg.movements,
      containers: g.agg.containers,
      completed: g.agg.completed,
      rejected: g.agg.rejected + g.agg.damaged,
      completion: pctOf(g.agg.completed, g.agg.movements),
      exceptions: exc,
      excRate: pctOf(g.infos.filter((i) => exByMovement.has(i.m.id)).length, g.agg.movements),
      turnaround: fmtDur(avgTurn(g.agg)),
      turnMins: avgTurn(g.agg),
      days: g.agg.days.size,
      payable,
    });
  }
  rows.sort((a, b) => Number(b.movements) - Number(a.movements) || String(a.id).localeCompare(String(b.id)));
  const withWork = rows.filter((r) => Number(r.movements) > 0);
  const top = withWork[0];
  return {
    columns: [
      col("driverId", "Driver ID"),
      col("name", "Driver"),
      col("status", "Status"),
      col("movements", "Journeys", "int"),
      col("containers", "Container units", "int"),
      col("completed", "Completed", "int"),
      col("rejected", "Rejected / damaged", "int"),
      col("completion", "Completion %", "pct"),
      col("exceptions", "Exceptions", "int"),
      col("excRate", "Journeys with exception %", "pct"),
      col("turnaround", "Avg turnaround"),
      col("days", "Active days", "int"),
      col("payable", "Payable units", "int"),
    ],
    rows,
    notes: [JOURNEY_NOTE, "Turnaround = loading to discharge of completed journeys under 24h. Payable units follow the configured pay unit mode (demo assumption)."],
    summary: [
      { label: "Drivers with journeys", value: String(withWork.length), hint: `of ${db.drivers.length} registered` },
      { label: "Journeys", value: formatNumber(infos.length) },
      { label: "Avg journeys / driver", value: withWork.length ? formatNumber(infos.length / withWork.length, 1) : "—" },
      { label: "Top driver", value: top && top.movements ? String(top.name) : "—", hint: top && top.movements ? `${top.movements} journeys` : undefined },
    ],
    chartData: {
      title: "Journeys per driver",
      kind: "bar",
      xKey: "label",
      series: [
        { key: "Completed", name: "Completed", color: CHART_COLORS.green, stackId: "s" },
        { key: "Other", name: "Other statuses", color: CHART_COLORS.grey, stackId: "s" },
      ],
      data: withWork.slice(0, 14).map((r) => ({ label: String(r.name).split(" ")[0] + " " + String(r.id), Completed: Number(r.completed), Other: Number(r.movements) - Number(r.completed) })),
    },
  };
}

function elapsedDays(f: ReportFilters): number {
  const end = f.to > demoToday() ? demoToday() : f.to;
  return Math.max(1, daysBetween(f.from, end < f.from ? f.from : end) + 1);
}

function vehicleReport(f: ReportFilters, db: DB): ReportResult {
  const infos = filterMovements(db, f);
  const groups = new Map<string, Agg>();
  for (const v of db.primeMovers) if (!f.vehicleId || v.id === f.vehicleId) groups.set(v.id, newAgg());
  for (const i of infos) {
    const k = i.m.primeMoverId ?? "NONE";
    const g = groups.get(k) ?? newAgg();
    addTo(g, i, db);
    groups.set(k, g);
  }
  const span = elapsedDays(f);
  const fuel = db.fuelRecords.filter((r) => r.date >= f.from && r.date <= f.to && r.source === "GPS");
  const rows: ReportRow[] = [];
  for (const [id, a] of groups) {
    if (id === "NONE" && !a.movements) continue;
    const v = db.primeMovers.find((x) => x.id === id);
    const gps = fuel.filter((r) => r.vehicleId === id);
    const litres = gps.reduce((s, r) => s + r.litres, 0);
    const km = gps.reduce((s, r) => s + (r.distanceKm ?? 0), 0);
    rows.push({
      id,
      vehicleId: id === "NONE" ? "—" : id,
      regNo: v?.regNo ?? "No prime mover",
      status: v?.status ?? "—",
      movements: a.movements,
      containers: a.containers,
      completed: a.completed,
      rejected: a.rejected + a.damaged,
      days: a.days.size,
      utilisation: id === "NONE" ? null : round2(Math.min(100, (a.days.size / span) * 100)),
      perDay: round2(a.movements / span),
      turnaround: fmtDur(avgTurn(a)),
      litres: round2(litres),
      km: Math.round(km),
    });
  }
  rows.sort((a, b) => Number(b.movements) - Number(a.movements) || String(a.id).localeCompare(String(b.id)));
  const real = rows.filter((r) => r.vehicleId !== "—");
  const avgUtil = real.length ? real.reduce((s, r) => s + Number(r.utilisation ?? 0), 0) / real.length : 0;
  return {
    columns: [
      col("vehicleId", "Vehicle ID"),
      col("regNo", "Reg No"),
      col("status", "Fleet status"),
      col("movements", "Journeys", "int"),
      col("containers", "Container units", "int"),
      col("completed", "Completed", "int"),
      col("rejected", "Rejected / damaged", "int"),
      col("days", "Active days", "int"),
      col("utilisation", "Utilisation %", "pct"),
      col("perDay", "Journeys / day", "dec"),
      col("turnaround", "Avg turnaround"),
      col("litres", "GPS fuel (L)", "dec"),
      col("km", "GPS distance (km)", "int"),
    ],
    rows,
    notes: [JOURNEY_NOTE, `Utilisation = operational days with at least one journey ÷ ${span} elapsed days in the range (to ${f.to > demoToday() ? "today" : f.to}). No staffing rule is assumed.`],
    summary: [
      { label: "Prime movers", value: String(real.length), hint: `${real.filter((r) => Number(r.movements) > 0).length} used in period` },
      { label: "Journeys", value: formatNumber(infos.length) },
      { label: "Avg utilisation", value: `${avgUtil.toFixed(0)}%` },
      { label: "GPS fuel", value: `${formatNumber(real.reduce((s, r) => s + Number(r.litres), 0))} L` },
    ],
    chartData: {
      title: "Utilisation % per prime mover",
      kind: "bar",
      xKey: "label",
      series: [{ key: "Utilisation", name: "Utilisation %", color: CHART_COLORS.blue }],
      data: real.map((r) => ({ label: String(r.vehicleId), Utilisation: Number(r.utilisation ?? 0) })),
    },
  };
}

function terminalReport(f: ReportFilters, db: DB): ReportResult {
  const infos = filterMovements(db, f);
  const exIds = new Map<string, number>();
  const ids = new Set(infos.map((i) => i.m.id));
  for (const e of db.exceptions) if (ids.has(e.movementId)) exIds.set(e.movementId, (exIds.get(e.movementId) ?? 0) + 1);
  const rows: ReportRow[] = [];
  for (const t of db.terminals) {
    const src = infos.filter((i) => i.m.sourceTerminal === t.code);
    const dst = infos.filter((i) => i.m.destinationTerminal === t.code);
    if (!src.length && !dst.length) continue;
    const a = newAgg();
    for (const i of src) addTo(a, i, db);
    const exc = src.reduce((s, i) => s + (exIds.get(i.m.id) ?? 0), 0);
    rows.push({
      id: t.code,
      terminal: t.code,
      name: t.name,
      dispatched: src.length,
      containers: a.containers,
      received: dst.length,
      completed: a.completed,
      rejected: a.rejected,
      damaged: a.damaged,
      exceptions: exc,
      excRate: pctOf(src.filter((i) => exIds.has(i.m.id)).length, src.length),
      turnaround: fmtDur(avgTurn(a)),
      billable: a.billable,
    });
  }
  const totalExc = rows.reduce((s, r) => s + Number(r.exceptions), 0);
  return {
    columns: [
      col("terminal", "Terminal"),
      col("name", "Name"),
      col("dispatched", "Journeys dispatched (source)", "int"),
      col("containers", "Container units dispatched", "int"),
      col("received", "Journeys received (destination)", "int"),
      col("completed", "Completed", "int"),
      col("rejected", "Rejected", "int"),
      col("damaged", "Damaged", "int"),
      col("exceptions", "Exceptions", "int"),
      col("excRate", "Journeys with exception %", "pct"),
      col("turnaround", "Avg turnaround"),
      col("billable", "Billable journeys", "int"),
    ],
    rows,
    notes: [JOURNEY_NOTE, "Dispatch-side measures (completion, rejection, exceptions, turnaround) are attributed to the source terminal. CICT availability is conditional on a usable sample format."],
    summary: [
      { label: "Terminals active", value: String(rows.length) },
      { label: "Journeys", value: formatNumber(infos.length) },
      { label: "Exceptions", value: formatNumber(totalExc) },
      { label: "Busiest source", value: rows.length ? String([...rows].sort((a, b) => Number(b.dispatched) - Number(a.dispatched))[0].terminal) : "—" },
    ],
    chartData: {
      title: "Terminal comparison",
      kind: "bar",
      xKey: "label",
      series: [
        { key: "Dispatched", name: "Dispatched", color: CHART_COLORS.blue },
        { key: "Received", name: "Received", color: CHART_COLORS.green },
        { key: "Exceptions", name: "Exceptions", color: CHART_COLORS.red },
      ],
      data: rows.map((r) => ({ label: String(r.terminal), Dispatched: Number(r.dispatched), Received: Number(r.received), Exceptions: Number(r.exceptions) })),
    },
  };
}

function routeReport(f: ReportFilters, db: DB, canFin: boolean): ReportResult {
  const infos = filterMovements(db, f);
  const map = new Map<string, { agg: Agg; revenue: number; unrated: number }>();
  for (const i of infos) {
    const k = `${i.m.sourceTerminal}-${i.m.destinationTerminal}`;
    const g = map.get(k) ?? { agg: newAgg(), revenue: 0, unrated: 0 };
    addTo(g.agg, i, db);
    const rev = movementRevenue(i.m, db);
    if (rev === "unrated") g.unrated += 1;
    else if (rev) g.revenue += rev.total;
    map.set(k, g);
  }
  const rows: ReportRow[] = [...map.entries()]
    .sort((a, b) => b[1].agg.movements - a[1].agg.movements)
    .map(([k, g]) => {
      const row: ReportRow = {
        id: k,
        route: k.replace("-", " → "),
        movements: g.agg.movements,
        containers: g.agg.containers,
        c20: g.agg.c20,
        c40: g.agg.c40,
        completed: g.agg.completed,
        rejected: g.agg.rejected + g.agg.damaged,
        completion: pctOf(g.agg.completed, g.agg.movements),
        turnaround: fmtDur(avgTurn(g.agg)),
        billable: g.agg.billable,
        billableUnits: g.agg.billableUnits,
      };
      if (canFin) {
        row.revenue = round2(g.revenue);
        row.unrated = g.unrated;
      }
      return row;
    });
  const columns = [
    col("route", "Route"),
    col("movements", "Journeys", "int"),
    col("containers", "Container units", "int"),
    col("c20", "20FT units", "int"),
    col("c40", "40FT units", "int"),
    col("completed", "Completed", "int"),
    col("rejected", "Rejected / damaged", "int"),
    col("completion", "Completion %", "pct"),
    col("turnaround", "Avg turnaround"),
    col("billable", "Billable journeys", "int"),
    col("billableUnits", "Billable units", "int"),
  ];
  const summary: SummaryItem[] = [
    { label: "Routes in use", value: String(rows.length) },
    { label: "Journeys", value: formatNumber(infos.length) },
    { label: "Container units", value: formatNumber(rows.reduce((s, r) => s + Number(r.containers), 0)) },
  ];
  if (canFin) {
    columns.push(col("revenue", `Rate-card revenue (${db.settings.currency})`, "money"), col("unrated", "Billable w/o rate", "int"));
    summary.push({ label: "Rate-card revenue", value: formatMoney(rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0), db.settings.currency), hint: "billable journeys x effective rates + diesel" });
  } else summary.push({ label: "Billable journeys", value: formatNumber(rows.reduce((s, r) => s + Number(r.billable), 0)) });
  return {
    columns,
    rows,
    notes: [JOURNEY_NOTE, canFin ? "Revenue is a demo estimate: billable journeys only (per billable status) x effective-dated rate card, incl. diesel adjustment." : "Revenue columns are restricted to the CEO and the Manager."],
    summary,
    chartData: {
      title: "Journeys by route",
      kind: "bar",
      xKey: "label",
      series: [
        { key: "Completed", name: "Completed", color: CHART_COLORS.green, stackId: "s" },
        { key: "Other", name: "Other statuses", color: CHART_COLORS.grey, stackId: "s" },
      ],
      data: rows.map((r) => ({ label: String(r.route), Completed: Number(r.completed), Other: Number(r.movements) - Number(r.completed) })),
    },
  };
}

function containerReport(f: ReportFilters, db: DB): ReportResult {
  const infos = filterMovements(db, f);
  const cats = [
    { id: "20-single", label: "20FT – single container", teu: db.containerTypes.find((c) => c.size === "20FT")?.teu ?? 1 },
    { id: "20-twin", label: "20FT – twin (2 x 20FT, one journey)", teu: db.containerTypes.find((c) => c.size === "20FT")?.teu ?? 1 },
    { id: "40", label: "40FT", teu: db.containerTypes.find((c) => c.size === "40FT")?.teu ?? 2 },
  ];
  const acc = new Map(cats.map((c) => [c.id, { journeys: 0, containers: 0, completed: 0 }]));
  for (const { m } of infos) {
    const n = Math.max(1, m.containerNos.length);
    const id = m.containerSize === "40FT" ? "40" : n >= 2 ? "20-twin" : "20-single";
    const a = acc.get(id) as { journeys: number; containers: number; completed: number };
    a.journeys += 1;
    a.containers += n;
    if (m.status === "Completed") a.completed += 1;
  }
  const totJ = infos.length;
  const totC = [...acc.values()].reduce((s, a) => s + a.containers, 0);
  const rows: ReportRow[] = cats.map((c) => {
    const a = acc.get(c.id) as { journeys: number; containers: number; completed: number };
    return {
      id: c.id,
      category: c.label,
      journeys: a.journeys,
      containers: a.containers,
      teu: a.containers * c.teu,
      completed: a.completed,
      jShare: pctOf(a.journeys, totJ),
      cShare: pctOf(a.containers, totC),
    };
  });
  const totTeu = rows.reduce((s, r) => s + Number(r.teu), 0);
  return {
    columns: [
      col("category", "Category"),
      col("journeys", "Journeys", "int"),
      col("containers", "Container units", "int"),
      col("teu", "TEU", "int"),
      col("completed", "Completed journeys", "int"),
      col("jShare", "Share of journeys %", "pct"),
      col("cShare", "Share of containers %", "pct"),
    ],
    rows,
    notes: [JOURNEY_NOTE, "TEU uses the container master (20FT = 1, 40FT = 2)."],
    summary: [
      { label: "Journeys", value: formatNumber(totJ) },
      { label: "Container units", value: formatNumber(totC) },
      { label: "TEU", value: formatNumber(totTeu) },
      { label: "Twin-20FT journeys", value: formatNumber(Number(rows[1].journeys)), hint: "2 containers, 1 journey" },
    ],
    chartData: {
      title: "Container units by category",
      kind: "bar",
      xKey: "label",
      series: [
        { key: "Journeys", name: "Journeys", color: CHART_COLORS.navy },
        { key: "Containers", name: "Container units", color: CHART_COLORS.green },
      ],
      data: rows.map((r) => ({ label: String(r.category).split(" (")[0], Journeys: Number(r.journeys), Containers: Number(r.containers) })),
    },
  };
}

function exceptionReport(f: ReportFilters, db: DB): ReportResult {
  if (!rangeValid(f)) return { ...EMPTY };
  const start = db.settings.opDayStartHour;
  const mv = new Map(db.movements.map((m) => [m.id, m]));
  const userName = (id: string | null) => (id ? (db.users.find((u) => u.id === id)?.name ?? id) : "Unassigned");
  const needsMovement = !!(f.driverId || f.vehicleId || f.route || f.size || f.status);
  const today = demoToday();
  const list = db.exceptions.filter((e) => {
    const day = operationalDay(e.reportedAt, start);
    if (day < f.from || day > f.to) return false;
    const m = mv.get(e.movementId);
    if (f.terminal && e.sourceTerminal !== f.terminal && m?.destinationTerminal !== f.terminal) return false;
    if (needsMovement && !m) return false;
    if (m) {
      if (f.driverId && m.driverId !== f.driverId) return false;
      if (f.vehicleId && m.primeMoverId !== f.vehicleId) return false;
      if (f.route && `${m.sourceTerminal}-${m.destinationTerminal}` !== f.route) return false;
      if (f.size && m.containerSize !== f.size) return false;
      if (f.status && m.status !== f.status) return false;
    }
    return true;
  });
  const rows: ReportRow[] = list
    .map((e) => {
      const day = operationalDay(e.reportedAt, start);
      const closed = e.status === "Resolved" || e.status === "Rejected";
      const endDay = closed && e.resolvedAt ? operationalDay(e.resolvedAt, start) : today;
      return {
        id: e.id,
        exceptionId: e.id,
        movementId: e.movementId,
        container: e.containerNo,
        type: e.type,
        terminal: e.sourceTerminal,
        priority: e.priority,
        reported: day,
        assignedTo: userName(e.assignedTo),
        status: e.status,
        material: e.materialCorrection ? "Yes" : "No",
        age: Math.max(0, daysBetween(day, endDay)),
      } satisfies ReportRow;
    })
    .sort((a, b) => String(b.reported).localeCompare(String(a.reported)));
  const open = list.filter((e) => e.status === "Open" || e.status === "Under Review").length;
  const byType = new Map<string, { open: number; closed: number }>();
  for (const e of list) {
    const g = byType.get(e.type) ?? { open: 0, closed: 0 };
    if (e.status === "Open" || e.status === "Under Review") g.open += 1;
    else g.closed += 1;
    byType.set(e.type, g);
  }
  const topType = [...byType.entries()].sort((a, b) => b[1].open + b[1].closed - (a[1].open + a[1].closed))[0];
  return {
    columns: [
      col("exceptionId", "Exception"),
      col("movementId", "Movement"),
      col("container", "Container"),
      col("type", "Type"),
      col("terminal", "Source"),
      col("priority", "Priority"),
      col("reported", "Reported (op. day)"),
      col("assignedTo", "Assigned to"),
      col("status", "Status"),
      col("material", "Material correction"),
      col("age", "Age (days)", "int"),
    ],
    rows,
    notes: ["Exceptions are dated by the operational day of their reported time. Unresolved exceptions block billable status."],
    summary: [
      { label: "Exceptions", value: formatNumber(list.length) },
      { label: "Open / under review", value: formatNumber(open) },
      { label: "Critical", value: formatNumber(list.filter((e) => e.priority === "Critical").length) },
      { label: "Most frequent type", value: topType ? topType[0] : "—", hint: topType ? `${topType[1].open + topType[1].closed} raised` : undefined },
    ],
    chartData: {
      title: "Exceptions by type",
      kind: "bar",
      xKey: "label",
      series: [
        { key: "Unresolved", name: "Open / under review", color: CHART_COLORS.red, stackId: "s" },
        { key: "Closed", name: "Resolved / rejected", color: CHART_COLORS.green, stackId: "s" },
      ],
      data: [...byType.entries()].map(([t, g]) => ({ label: t, Unresolved: g.open, Closed: g.closed })),
    },
  };
}

function paymentReport(f: ReportFilters, db: DB): ReportResult {
  if (!rangeValid(f)) return { ...EMPTY };
  const cur = db.settings.currency;
  const runs = db.payRuns.filter((r) => r.periodEnd >= f.from && r.periodStart <= f.to);
  const rows: ReportRow[] = [];
  for (const r of runs) {
    for (const l of r.lines) {
      if (f.driverId && l.driverId !== f.driverId) continue;
      rows.push({
        id: `${r.id}-${l.driverId}`,
        run: r.id,
        period: `${r.periodStart} → ${r.periodEnd}`,
        status: r.status,
        driverId: l.driverId === "UNASSIGNED" ? "—" : l.driverId,
        driver: l.driverName,
        completed: l.completedMovements,
        units: l.payableUnits,
        base: l.baseAmount,
        adjustments: l.adjustments,
        total: l.total,
        excluded: l.excluded.length,
      });
    }
  }
  const sum = (status: string) => rows.filter((r) => r.status === status).reduce((s, r) => s + Number(r.total), 0);
  const perRun = runs
    .map((r) => {
      const t = r.lines.filter((l) => !f.driverId || l.driverId === f.driverId).reduce((s, l) => s + l.total, 0);
      return { label: `${r.periodStart.slice(5)} → ${r.periodEnd.slice(5)}`, Approved: r.status === "Approved" ? round2(t) : 0, Draft: r.status === "Draft" ? round2(t) : 0 };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
  return {
    columns: [
      col("run", "Pay run"),
      col("period", "Period"),
      col("status", "Run status"),
      col("driverId", "Driver ID"),
      col("driver", "Driver"),
      col("completed", "Completed journeys", "int"),
      col("units", "Payable units", "int"),
      col("base", `Base (${cur})`, "money"),
      col("adjustments", `Adjustments (${cur})`, "money"),
      col("total", `Total (${cur})`, "money"),
      col("excluded", "Excluded", "int"),
    ],
    rows,
    notes: ["Demo simulation – pay unit mode and rates are configurable demo assumptions pending contractual confirmation. Shows pay runs overlapping the date range."],
    summary: [
      { label: "Pay runs", value: String(runs.length), hint: `${runs.filter((r) => r.status === "Approved").length} approved` },
      { label: "Approved total", value: formatMoney(sum("Approved"), cur) },
      { label: "Draft total", value: formatMoney(sum("Draft"), cur) },
      { label: "Driver lines", value: String(rows.length) },
    ],
    chartData: {
      title: "Pay run totals",
      kind: "bar",
      xKey: "label",
      series: [
        { key: "Approved", name: "Approved", color: CHART_COLORS.green, stackId: "s" },
        { key: "Draft", name: "Draft", color: CHART_COLORS.orange, stackId: "s" },
      ],
      data: perRun,
    },
  };
}

const INVOICE_STATUSES = ["Draft", "Pending Approval", "Approved", "Exported"] as const;

function invoicesInRange(f: ReportFilters, db: DB) {
  if (!rangeValid(f)) return [];
  const m1 = f.from.slice(0, 7);
  const m2 = f.to.slice(0, 7);
  return db.invoices.filter((inv) => {
    if (inv.month < m1 || inv.month > m2) return false;
    if (f.terminal && inv.terminal !== f.terminal) return false;
    if (f.route && inv.routeFilter !== f.route && !inv.lines.some((l) => l.route === f.route)) return false;
    if (f.size && inv.sizeFilter !== f.size && !inv.lines.some((l) => l.containerSize === f.size)) return false;
    return true;
  });
}

function invoiceReport(f: ReportFilters, db: DB): ReportResult {
  const cur = db.settings.currency;
  const list = invoicesInRange(f, db);
  const rows: ReportRow[] = list
    .map((inv) => ({
      id: inv.id,
      invoiceNo: inv.invoiceNo,
      terminal: inv.terminal,
      month: inv.month,
      scope: [inv.routeFilter?.replace("-", " → "), inv.sizeFilter].filter(Boolean).join(" · ") || "All routes / sizes",
      status: inv.status,
      journeys: inv.lines.length,
      containers: inv.lines.reduce((s, l) => s + l.containerNos.length, 0),
      units: inv.lines.reduce((s, l) => s + l.units, 0),
      base: inv.baseAmount,
      diesel: inv.dieselAmount,
      final: inv.finalAmount,
      excluded: inv.excluded.length,
      created: inv.createdAt.slice(0, 10),
    }))
    .sort((a, b) => String(b.month).localeCompare(String(a.month)) || String(a.invoiceNo).localeCompare(String(b.invoiceNo)));
  const total = (s: string[]) => list.filter((i) => s.includes(i.status)).reduce((t, i) => t + i.finalAmount, 0);
  const months = bucketKeys(f.from, f.to, "month");
  return {
    columns: [
      col("invoiceNo", "Invoice No"),
      col("terminal", "Terminal"),
      col("month", "Billing month"),
      col("scope", "Scope"),
      col("status", "Status"),
      col("journeys", "Journeys", "int"),
      col("containers", "Container units", "int"),
      col("units", "Billed units", "int"),
      col("base", `Base (${cur})`, "money"),
      col("diesel", `Diesel adj. (${cur})`, "money"),
      col("final", `Final (${cur})`, "money"),
      col("excluded", "Excluded", "int"),
      col("created", "Created"),
    ],
    rows,
    notes: ["Invoices are selected by billing month overlapping the date range. Demo simulation – no ERP posting."],
    summary: [
      { label: "Invoices", value: String(list.length) },
      { label: "Approved / exported", value: formatMoney(total(["Approved", "Exported"]), cur) },
      { label: "Draft / pending", value: formatMoney(total(["Draft", "Pending Approval"]), cur) },
      { label: "Total value", value: formatMoney(list.reduce((t, i) => t + i.finalAmount, 0), cur) },
    ],
    chartData: {
      title: "Invoice value by billing month",
      kind: "bar",
      xKey: "label",
      series: [
        { key: "Draft", name: "Draft", color: CHART_COLORS.grey, stackId: "s" },
        { key: "Pending Approval", name: "Pending approval", color: CHART_COLORS.orange, stackId: "s" },
        { key: "Approved", name: "Approved", color: CHART_COLORS.green, stackId: "s" },
        { key: "Exported", name: "Exported", color: CHART_COLORS.navy, stackId: "s" },
      ],
      data: months.map((mo) => {
        const row: Record<string, string | number> = { label: bucketLabel(mo, "month") };
        for (const s of INVOICE_STATUSES) row[s] = round2(list.filter((i) => i.month === mo && i.status === s).reduce((t, i) => t + i.finalAmount, 0));
        return row;
      }),
    },
  };
}

function fuelReport(f: ReportFilters, db: DB, canFin: boolean): ReportResult {
  if (!rangeValid(f)) return { ...EMPTY };
  const cur = db.settings.currency;
  const thr = db.settings.fuelVarianceThresholdPct;
  const recs = db.fuelRecords.filter((r) => r.date >= f.from && r.date <= f.to && (!f.vehicleId || r.vehicleId === f.vehicleId));
  const map = new Map<string, { vehicleId: string; month: string; gps: number; inv: number; man: number; amount: number; km: number }>();
  for (const r of recs) {
    const month = r.date.slice(0, 7);
    const k = `${r.vehicleId}|${month}`;
    const g = map.get(k) ?? { vehicleId: r.vehicleId, month, gps: 0, inv: 0, man: 0, amount: 0, km: 0 };
    if (r.source === "GPS") {
      g.gps += r.litres;
      g.km += r.distanceKm ?? 0;
    } else if (r.source === "Fuel Invoice") {
      g.inv += r.litres;
      g.amount += r.amount ?? 0;
    } else g.man += r.litres;
    map.set(k, g);
  }
  const rows: ReportRow[] = [...map.entries()]
    .sort((a, b) => a[1].month.localeCompare(b[1].month) || a[1].vehicleId.localeCompare(b[1].vehicleId))
    .map(([k, g]) => {
      const diff = g.gps - g.inv;
      const variance = g.inv > 0 && g.gps > 0 ? round2((diff / g.inv) * 100) : null;
      const flag = g.gps === 0 ? "No GPS data" : g.inv === 0 ? "No invoice data" : Math.abs(variance ?? 0) > thr ? "Above threshold" : "Within threshold";
      const review = db.fuelReviews.find((r) => r.key === k);
      const row: ReportRow = {
        id: k,
        vehicle: g.vehicleId,
        regNo: db.primeMovers.find((v) => v.id === g.vehicleId)?.regNo ?? "—",
        month: g.month,
        gps: round2(g.gps),
        invoice: round2(g.inv),
        manual: round2(g.man),
        diff: g.gps > 0 && g.inv > 0 ? round2(diff) : null,
        variance,
        flag,
        review: review?.status ?? (flag === "Above threshold" ? "Pending Review" : "—"),
        km: Math.round(g.km),
      };
      if (canFin) {
        row.cost = round2(g.amount);
        row.perLitre = g.inv > 0 ? round2(g.amount / g.inv) : null;
      }
      return row;
    });
  const columns = [
    col("vehicle", "Vehicle"),
    col("regNo", "Reg No"),
    col("month", "Month"),
    col("gps", "GPS litres", "dec"),
    col("invoice", "Fuel-station litres", "dec"),
    col("manual", "Manual litres", "dec"),
    col("diff", "Difference (GPS − invoice)", "dec"),
    col("variance", "Variance %", "pct"),
    col("flag", "Flag"),
    col("review", "Review"),
    col("km", "GPS km", "int"),
  ];
  if (canFin) columns.push(col("cost", `Invoice cost (${cur})`, "money"), col("perLitre", `${cur} / litre`, "money"));
  const gpsT = rows.reduce((s, r) => s + Number(r.gps), 0);
  const invT = rows.reduce((s, r) => s + Number(r.invoice), 0);
  const flagged = rows.filter((r) => r.flag === "Above threshold").length;
  const byVehicle = new Map<string, { GPS: number; Invoice: number }>();
  for (const r of rows) {
    const g = byVehicle.get(String(r.vehicle)) ?? { GPS: 0, Invoice: 0 };
    g.GPS += Number(r.gps);
    g.Invoice += Number(r.invoice);
    byVehicle.set(String(r.vehicle), g);
  }
  const summary: SummaryItem[] = [
    { label: "GPS litres", value: `${formatNumber(gpsT)} L` },
    { label: "Fuel-station litres", value: `${formatNumber(invT)} L` },
    { label: "Overall variance", value: invT > 0 && gpsT > 0 ? `${(((gpsT - invT) / invT) * 100).toFixed(1)}%` : "—", hint: `threshold ±${thr}%` },
    { label: "Flagged vehicle-months", value: String(flagged), hint: `of ${rows.length}` },
  ];
  if (canFin) summary.push({ label: "Fuel invoice cost", value: formatMoney(rows.reduce((s, r) => s + Number(r.cost ?? 0), 0), cur) });
  return {
    columns,
    rows,
    notes: [
      "GPS, fuel-station and manual records are preserved separately and never overwritten; this report only compares them.",
      canFin ? "Cost data is shown to the CEO and the Manager only." : "Cost columns are restricted to the CEO and the Manager.",
    ],
    summary,
    chartData: {
      title: "GPS vs fuel-station litres per vehicle",
      kind: "bar",
      xKey: "label",
      series: [
        { key: "GPS", name: "GPS litres", color: CHART_COLORS.blue },
        { key: "Invoice", name: "Fuel-station litres", color: CHART_COLORS.green },
      ],
      data: [...byVehicle.entries()].sort().map(([v, g]) => ({ label: v, GPS: round2(g.GPS), Invoice: round2(g.Invoice) })),
    },
  };
}

/**
 * Build a report. `canFinancial` must be true (CEO / Manager) for financial
 * reports and money columns; otherwise financial reports return an empty restricted result.
 */
export function buildReport(type: ReportType, filters: ReportFilters, db: DB, canFinancial = false): ReportResult {
  const meta = reportMeta(type);
  if (meta.financial && !canFinancial) {
    return { ...EMPTY, notes: ["This report contains financial information and is restricted to the CEO and the Manager."] };
  }
  switch (type) {
    case "daily":
    case "weekly":
    case "monthly":
      return periodReport(type, filters, db);
    case "driver":
      return driverReport(filters, db);
    case "vehicle":
      return vehicleReport(filters, db);
    case "terminal":
      return terminalReport(filters, db);
    case "route":
      return routeReport(filters, db, canFinancial);
    case "container":
      return containerReport(filters, db);
    case "exception":
      return exceptionReport(filters, db);
    case "payment":
      return paymentReport(filters, db);
    case "invoice":
      return invoiceReport(filters, db);
    case "fuel":
      return fuelReport(filters, db, canFinancial);
  }
}

/** Plain export rows keyed by column label (raw numeric values). */
export function exportRows(result: ReportResult): Record<string, string | number | null>[] {
  return result.rows.map((r) => {
    const o: Record<string, string | number | null> = {};
    for (const c of result.columns) o[c.label] = r[c.key] ?? null;
    return o;
  });
}

/* ------------------------------------------------------- analytics charts */

export interface AnalyticsData {
  granularity: Granularity;
  trend: { label: string; Completed: number; Pending: number; Rejected: number; Containers: number }[];
  terminals: { label: string; Dispatched: number; Received: number; Completed: number; Containers: number }[];
  drivers: { label: string; Completed: number; Other: number }[];
  vehicles: { label: string; Journeys: number; Utilisation: number }[];
  containers: { name: string; value: number; journeys: number }[];
  fuelByMonth: { label: string; GPS: number; Invoice: number; Manual: number }[];
  fuelByVehicle: { label: string; GPS: number; Invoice: number; Manual: number }[];
  revenue: { label: string; Base: number; Diesel: number }[] | null;
  invoiceTotals: ({ label: string } & Record<(typeof INVOICE_STATUSES)[number], number>)[] | null;
  exceptions: { label: string; Opened: number; Resolved: number }[];
}

export function buildAnalytics(f: ReportFilters, db: DB, canFinancial: boolean): AnalyticsData {
  const g = autoGranularity(f.from || demoToday(), f.to || demoToday());
  const valid = rangeValid(f);
  const infos = filterMovements(db, f);
  const keys = valid ? bucketKeys(f.from, f.to, g) : [];

  const trendMap = new Map(keys.map((k) => [k, { Completed: 0, Pending: 0, Rejected: 0, Containers: 0 }]));
  const revMap = new Map(keys.map((k) => [k, { Base: 0, Diesel: 0 }]));
  for (const { m, day } of infos) {
    const b = trendMap.get(bucketKey(day, g));
    if (b) {
      if (m.status === "Completed") b.Completed += 1;
      else if (m.status === "Rejected" || m.status === "Damaged") b.Rejected += 1;
      else b.Pending += 1;
      b.Containers += Math.max(1, m.containerNos.length);
    }
    if (canFinancial) {
      const rev = movementRevenue(m, db);
      const r = revMap.get(bucketKey(day, g));
      if (rev && rev !== "unrated" && r) {
        r.Base += rev.base;
        r.Diesel += rev.diesel;
      }
    }
  }

  const terminals = db.terminals
    .map((t) => {
      const src = infos.filter((i) => i.m.sourceTerminal === t.code);
      return {
        label: t.code as string,
        Dispatched: src.length,
        Received: infos.filter((i) => i.m.destinationTerminal === t.code).length,
        Completed: src.filter((i) => i.m.status === "Completed").length,
        Containers: src.reduce((s, i) => s + Math.max(1, i.m.containerNos.length), 0),
      };
    })
    .filter((t) => t.Dispatched || t.Received);

  const drv = new Map<string, { Completed: number; Other: number }>();
  for (const { m } of infos) {
    const k = m.driverId ?? "UNASSIGNED";
    const d = drv.get(k) ?? { Completed: 0, Other: 0 };
    if (m.status === "Completed") d.Completed += 1;
    else d.Other += 1;
    drv.set(k, d);
  }
  const drivers = [...drv.entries()]
    .sort((a, b) => b[1].Completed + b[1].Other - (a[1].Completed + a[1].Other))
    .slice(0, 10)
    .map(([id, v]) => ({ label: id === "UNASSIGNED" ? "Unassigned" : (db.drivers.find((d) => d.id === id)?.name ?? id), ...v }));

  const span = elapsedDays(f);
  const veh = new Map<string, { n: number; days: Set<string> }>();
  for (const { m, day } of infos) {
    if (!m.primeMoverId) continue;
    const v = veh.get(m.primeMoverId) ?? { n: 0, days: new Set<string>() };
    v.n += 1;
    v.days.add(day);
    veh.set(m.primeMoverId, v);
  }
  const vehicles = db.primeMovers
    .filter((p) => !f.vehicleId || p.id === f.vehicleId)
    .map((p) => ({ label: p.id, Journeys: veh.get(p.id)?.n ?? 0, Utilisation: Math.round(Math.min(100, ((veh.get(p.id)?.days.size ?? 0) / span) * 100)) }));

  const containers = (["20FT", "40FT"] as const).map((s) => {
    const list = infos.filter((i) => i.m.containerSize === s);
    return { name: s, value: list.reduce((n, i) => n + Math.max(1, i.m.containerNos.length), 0), journeys: list.length };
  });

  const fuel = valid ? db.fuelRecords.filter((r) => r.date >= f.from && r.date <= f.to && (!f.vehicleId || r.vehicleId === f.vehicleId)) : [];
  const fm = new Map<string, { GPS: number; Invoice: number; Manual: number }>();
  const fv = new Map<string, { GPS: number; Invoice: number; Manual: number }>();
  const add = (map: Map<string, { GPS: number; Invoice: number; Manual: number }>, k: string, src: string, l: number) => {
    const o = map.get(k) ?? { GPS: 0, Invoice: 0, Manual: 0 };
    if (src === "GPS") o.GPS += l;
    else if (src === "Fuel Invoice") o.Invoice += l;
    else o.Manual += l;
    map.set(k, o);
  };
  for (const r of fuel) {
    add(fm, r.date.slice(0, 7), r.source, r.litres);
    add(fv, r.vehicleId, r.source, r.litres);
  }
  const fmt = (o: { GPS: number; Invoice: number; Manual: number }) => ({ GPS: round2(o.GPS), Invoice: round2(o.Invoice), Manual: round2(o.Manual) });

  const exTrend = new Map(keys.map((k) => [k, { Opened: 0, Resolved: 0 }]));
  const mvById = new Map(db.movements.map((m) => [m.id, m]));
  const start = db.settings.opDayStartHour;
  for (const e of db.exceptions) {
    const m = mvById.get(e.movementId);
    if (f.terminal && e.sourceTerminal !== f.terminal && m?.destinationTerminal !== f.terminal) continue;
    if (m) {
      if (f.driverId && m.driverId !== f.driverId) continue;
      if (f.vehicleId && m.primeMoverId !== f.vehicleId) continue;
      if (f.route && `${m.sourceTerminal}-${m.destinationTerminal}` !== f.route) continue;
      if (f.size && m.containerSize !== f.size) continue;
    } else if (f.driverId || f.vehicleId || f.route || f.size) continue;
    const o = exTrend.get(bucketKey(operationalDay(e.reportedAt, start), g));
    if (o) o.Opened += 1;
    if ((e.status === "Resolved" || e.status === "Rejected") && e.resolvedAt) {
      const r = exTrend.get(bucketKey(operationalDay(e.resolvedAt, start), g));
      if (r) r.Resolved += 1;
    }
  }

  const invList = canFinancial ? invoicesInRange(f, db) : [];
  const invoiceTotals = canFinancial
    ? bucketKeys(f.from, f.to, "month").map((mo) => {
        const row = { label: bucketLabel(mo, "month"), Draft: 0, "Pending Approval": 0, Approved: 0, Exported: 0 };
        for (const s of INVOICE_STATUSES) row[s] = round2(invList.filter((i) => i.month === mo && i.status === s).reduce((t, i) => t + i.finalAmount, 0));
        return row;
      })
    : null;

  return {
    granularity: g,
    trend: keys.map((k) => ({ label: bucketLabel(k, g), ...(trendMap.get(k) as { Completed: number; Pending: number; Rejected: number; Containers: number }) })),
    terminals,
    drivers,
    vehicles,
    containers,
    fuelByMonth: [...fm.entries()].sort().map(([k, v]) => ({ label: bucketLabel(k, "month"), ...fmt(v) })),
    fuelByVehicle: [...fv.entries()].sort().map(([k, v]) => ({ label: k, ...fmt(v) })),
    revenue: canFinancial ? keys.map((k) => ({ label: bucketLabel(k, g), Base: round2((revMap.get(k) as { Base: number }).Base), Diesel: round2((revMap.get(k) as { Diesel: number }).Diesel) })) : null,
    invoiceTotals,
    exceptions: keys.map((k) => ({ label: bucketLabel(k, g), ...(exTrend.get(k) as { Opened: number; Resolved: number }) })),
  };
}
