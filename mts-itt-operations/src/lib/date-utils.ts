import { format } from "date-fns";

/**
 * All timestamps in the demo are stored as wall-clock strings ("yyyy-MM-ddTHH:mm")
 * in ONE configured timezone (settings.timezone, default Asia/Colombo). All reporting-day
 * and shift maths below is done on the UTC representation of that wall clock, so results
 * never depend on the browser's timezone or DST.
 */
export const DEFAULT_TIMEZONE = "Asia/Colombo";
export const OP_DAY_START_HOUR = 7;
/** Fixed demo clock so that seeded data and "today" always agree. */
export const DEMO_NOW = "2026-11-13T17:30";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const asUtc = (iso: string) => Date.parse(`${iso.length === 10 ? `${iso}T00:00` : iso.slice(0, 16)}:00Z`);

export function isValidIso(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !Number.isNaN(asUtc(s));
}

/** Operational day (yyyy-MM-dd) of a timestamp: the 07:00→07:00 window it falls in. */
export function operationalDay(iso: string, startHour = OP_DAY_START_HOUR): string {
  return new Date(asUtc(iso) - startHour * HOUR).toISOString().slice(0, 10);
}

export function operationalDayRange(day: string, startHour = OP_DAY_START_HOUR) {
  const pad = String(startHour).padStart(2, "0");
  return { start: `${day}T${pad}:00`, end: `${addDays(day, 1)}T${pad}:00` };
}

export function addDays(day: string, n: number): string {
  return new Date(asUtc(day) + n * DAY).toISOString().slice(0, 10);
}

export function addHoursIso(iso: string, h: number): string {
  return new Date(asUtc(iso) + h * HOUR).toISOString().slice(0, 16);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((asUtc(b) - asUtc(a)) / DAY);
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export function minutesBetween(a: string, b: string): number {
  return Math.round((asUtc(b) - asUtc(a)) / 60000);
}

export const demoToday = () => operationalDay(DEMO_NOW);

export function monthOf(dayOrIso: string): string {
  return dayOrIso.slice(0, 7);
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function toLocalDate(iso: string): Date {
  const [y, mo, d] = iso.slice(0, 10).split("-").map(Number);
  const [h, mi] = iso.length > 10 ? iso.slice(11, 16).split(":").map(Number) : [12, 0];
  return new Date(y, mo - 1, d, h, mi);
}

export const formatDate = (iso?: string | null) => (iso ? format(toLocalDate(iso), "dd MMM yyyy") : "—");
export const formatTime = (iso?: string | null) => (iso && iso.length > 10 ? format(toLocalDate(iso), "HH:mm") : "—");
export const formatDateTime = (iso?: string | null) => (iso ? `${formatDate(iso)} ${formatTime(iso)}` : "—");
export const formatDay = (iso: string, pattern = "EEE dd MMM") => format(toLocalDate(iso), pattern);
export const formatMonth = (month: string) => format(toLocalDate(`${month}-01`), "MMMM yyyy");

/**
 * Loose date parser for imported spreadsheets. Accepts ISO strings, "dd/MM/yyyy HH:mm",
 * "dd-MM-yyyy HH:mm", "yyyy/MM/dd HH:mm", JS Dates (from SheetJS cellDates) and Excel serials.
 * Returns the wall-clock ISO string, null for blank, or "invalid".
 */
export function parseLooseDate(v: unknown): string | null | "invalid" {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return "invalid";
    // SheetJS returns UTC-based dates for wall-clock cells; use UTC parts.
    return v.toISOString().slice(0, 16);
  }
  if (typeof v === "number") {
    if (v < 20000 || v > 80000) return "invalid";
    const ms = Math.round((v - 25569) * DAY);
    return new Date(ms).toISOString().slice(0, 16);
  }
  const s = String(v).trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[T\s]+(\d{1,2}):(\d{2}))?/);
  if (m) return build(+m[1], +m[2], +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T\s]+(\d{1,2}):(\d{2}))?/);
  if (m) return build(+m[3], +m[2], +m[1], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
  return "invalid";
}

function build(y: number, mo: number, d: number, h: number, mi: number): string | "invalid" {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return "invalid";
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (dt.getUTCMonth() !== mo - 1) return "invalid";
  return dt.toISOString().slice(0, 16);
}

/** 15-day pay periods anchored to a fixed demo anchor (demo assumption – confirm with MTS). */
export const PAY_ANCHOR = "2026-10-01";
export function payPeriodFor(day: string): { start: string; end: string; index: number } {
  const idx = Math.floor(daysBetween(PAY_ANCHOR, day) / 15);
  const start = addDays(PAY_ANCHOR, idx * 15);
  return { start, end: addDays(start, 14), index: idx };
}
export function payPeriods(count = 6, upTo = demoToday()) {
  const cur = payPeriodFor(upTo);
  const out: { start: string; end: string; index: number }[] = [];
  for (let i = cur.index; i > cur.index - count && i >= 0; i--) {
    const start = addDays(PAY_ANCHOR, i * 15);
    out.push({ start, end: addDays(start, 14), index: i });
  }
  return out;
}
