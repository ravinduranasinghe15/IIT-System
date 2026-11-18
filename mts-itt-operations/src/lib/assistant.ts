import type { DB } from "@/types/db";
import type { Role } from "@/types/user";
import { addDays, demoToday, formatDate, formatDay, monthRange, realToday } from "./date-utils";
import { billableStatus, movementDay } from "./eligibility";
import { driverLogStats, movementShift } from "./driver-logs";
import { buildIttAnalysis } from "./itt-analysis";
import { pendingPayRequests } from "./mutations/payment";
import { canAccess } from "./permissions";
import { weekStart } from "./reports";
import { driverOnTruck } from "./roster-rules";
import { vehicleCosts } from "./vehicle-costs";
import { formatMoney, formatNumber } from "./utils";

/**
 * The in-app assistant. It is NOT a language model: it understands a fixed set of questions about MTS operations
 * (trips, chits, driver logs, roster, fleet, fuel and maintenance spend, revenue) and answers them from the live demo
 * data, respecting the signed-in role. Anything else gets a short list of what it can do.
 */

export interface AssistantLink {
  label: string;
  href: string;
}
export interface AssistantReply {
  text: string;
  links?: AssistantLink[];
}
export interface AssistantContext {
  role: Role;
  driverId?: string;
  userName: string;
}

export const SUGGESTIONS = [
  "How many trips today?",
  "Which movements are missing chits?",
  "Who is on shift today?",
  "How much did we spend on PM-001?",
  "What is the status of exceptions?",
  "How do I import a terminal report?",
];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s\-/:.]/g, " ").replace(/\s+/g, " ").trim();
const has = (q: string, ...words: (string | RegExp)[]) => words.some((w) => (typeof w === "string" ? q.includes(w) : w.test(q)));

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

interface Period {
  from: string;
  to: string;
  label: string;
}

/** "today", "yesterday", "this week", "this month", "last 7/30 days" or a date such as "13 nov"; defaults to the given period. */
function parsePeriod(q: string, fallback: Period): Period {
  const today = demoToday();
  if (has(q, "yesterday")) return { from: addDays(today, -1), to: addDays(today, -1), label: "yesterday" };
  if (has(q, "today", "tonight", "right now", "now")) return { from: today, to: today, label: "today" };
  if (has(q, "this week")) return { from: weekStart(today), to: today, label: "this week" };
  if (has(q, "last week")) {
    const s = addDays(weekStart(today), -7);
    return { from: s, to: addDays(s, 6), label: "last week" };
  }
  if (has(q, "this month")) return { from: monthRange(today.slice(0, 7)).from, to: today, label: "this month" };
  if (has(q, "last month")) {
    const prev = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
    return { ...monthRange(prev), label: "last month" };
  }
  const days = q.match(/last (\d{1,3}) days?/);
  if (days) return { from: addDays(today, -Number(days[1])), to: today, label: `the last ${days[1]} days` };
  const iso = q.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (iso) return { from: iso[1], to: iso[1], label: formatDate(iso[1]) };
  const dm = q.match(/\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  const md = q.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s-]+(\d{1,2})(?:st|nd|rd|th)?\b/);
  const hit = dm ? { d: Number(dm[1]), m: MONTHS.indexOf(dm[2]) } : md ? { d: Number(md[2]), m: MONTHS.indexOf(md[1]) } : null;
  if (hit && hit.d >= 1 && hit.d <= 31) {
    const date = `${today.slice(0, 4)}-${String(hit.m + 1).padStart(2, "0")}-${String(hit.d).padStart(2, "0")}`;
    return { from: date, to: date, label: formatDate(date) };
  }
  return fallback;
}

function findTruck(db: DB, q: string) {
  const pm = q.match(/\bpm[\s-]?0*(\d{1,3})\b/);
  if (pm) return db.primeMovers.find((p) => p.id === `PM-${pm[1].padStart(3, "0")}`) ?? null;
  const plate = q.match(/\bly[\s-]?(\d{4})\b/);
  if (plate) return db.primeMovers.find((p) => p.regNo.toLowerCase().replace(/[\s-]/g, "") === `ly${plate[1]}`) ?? null;
  return null;
}

function findDriver(db: DB, q: string) {
  const full = db.drivers.find((d) => q.includes(d.name.toLowerCase()));
  if (full) return full;
  const byToken = db.drivers.filter((d) => d.name.toLowerCase().split(" ").some((t) => t.length >= 4 && new RegExp(`\\b${t}\\b`).test(q)));
  if (byToken.length === 1) return byToken[0];
  const id = q.match(/\bdr[\s-]?0*(\d{1,3})\b/);
  return id ? (db.drivers.find((d) => d.id === `DR-${id[1].padStart(3, "0")}`) ?? null) : null;
}

const tripsIn = (db: DB, p: Period, filter: (m: DB["movements"][number]) => boolean = () => true) =>
  db.movements.filter((m) => {
    const day = movementDay(m, db.settings.opDayStartHour);
    return !!day && day >= p.from && day <= p.to && m.status !== "Pending" && filter(m);
  });

function link(ctx: AssistantContext, label: string, href: string): AssistantLink[] {
  return canAccess(ctx.role, href) ? [{ label, href }] : [];
}

const drvName = (db: DB, id: string | null) => (id ? (db.drivers.find((d) => d.id === id)?.name ?? id) : "no driver");

const HELP = [
  "I can answer questions about MTS operations from the system's data. Try asking:",
  "• **Trips** – “How many trips today / this week / on 13 Nov?”, “trips by terminal”, “Morning vs Night trips”",
  "• **Chits & logs** – “Which movements are missing chits?”, “missing driver logs”, “how many are billable?”",
  "• **Exceptions** – “How many open exceptions?”",
  "• **Roster** – “Who is on shift today?”, “who is absent?”, “open shifts”, “who is driving PM-005 today?”",
  "• **Fleet & cost** – “How much did we spend on PM-001?”, “last fuel for LY-5516”, “last service of PM-003”",
  "• **Money** – “Revenue this month”, “invoices outstanding”, “pay awaiting approval” (finance roles)",
  "• **How-to** – “How do I import a terminal report / submit chits / generate a roster / report a driver absent?”",
].join("\n");

export function answerQuestion(db: DB, raw: string, ctx: AssistantContext): AssistantReply {
  const q = norm(raw);
  const today = demoToday();
  const money = (n: number) => formatMoney(n, db.settings.currency);
  const isDriver = ctx.role === "Driver";
  const fin = ctx.role === "Manager" || ctx.role === "CEO"; // money questions: finance roles only

  if (!q) return { text: HELP };
  if (/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(q) && q.split(" ").length <= 4) return { text: `Hello ${ctx.userName.split(" ")[0]}! 👋\n\n${HELP}` };
  if (has(q, "what can you", "help", "what do you do", "capabilities", "what can i ask")) return { text: HELP };
  if (has(q, "thank")) return { text: "You're welcome! Ask me anything else about operations." };

  /* ------------------------------ how-to / definitions ------------------------------ */
  if (has(q, /\bhow\b.*\b(import|upload)\b.*(terminal|report|cwit|sagt|movement)/, /\bimport\b.*(terminal|report)/))
    return {
      text: "To import a terminal report:\n1. Open **Imports** and choose the CWIT or SAGT report file (or use the sample file).\n2. The system reads the file's own layout, matches containers, trucks and times, and shows a preview with any warnings.\n3. Confirm to create the movements. Each movement gets its driver from the roster (a verified driver log can correct it later) and duplicates are blocked.\n\nChits submitted earlier are linked automatically when their movement is created.",
      links: link(ctx, "Open Imports", "/imports"),
    };
  if (has(q, /\b(submit|upload|add)\b.*\bchits?\b/, /how.*\bchits?\b/))
    return {
      text: "To submit chits: open **Chits & Evidence**, choose **Submit chits** and add the loading / discharge chit images. Each chit is matched to its movement and read automatically. A chit whose confidence score is at or above the threshold (80% by default) and that matches the movement is **verified automatically**; the rest wait for a person to verify. When both chits of a movement are in, it becomes Completed.",
      links: link(ctx, "Open Chits & Evidence", "/evidence"),
    };
  if (has(q, /driver logs?\b.*(upload|submit|how)/, /how.*driver logs?/))
    return {
      text: "Driver log sheets are uploaded in **Driver Logs**: enter the driver, lorry, shift and date written on the sheet and attach the photo. It is read automatically and, if confident, verified automatically. A verified log covers every movement of that lorry in that shift, and it sets the real driver on those movements.",
      links: link(ctx, "Open Driver Logs", "/driver-logs"),
    };
  if (has(q, /generate.*roster/, /create.*roster/, /roster.*(generate|create|next week)/, /how.*roster/))
    return {
      text: "The Manager generates a roster from **Drivers & Roster → Generate roster**: pick the week, then set how many trucks run per shift (one number for the whole week, or date by date). The system picks trucks and drivers within the rules (12-hour shifts, rest, weekly day off, one driver per truck per shift) and shows a preview with any shortfalls before you publish.",
      links: link(ctx, "Open Roster", "/drivers/roster"),
    };
  if (has(q, /(driver|he|she).*(not coming|absent|sick)/, /report.*absen/, /mark.*absent/))
    return {
      text: "When a driver tells the supervisor he is not coming, the supervisor taps **Driver not coming** on the roster, picks the driver and the reason. The shift becomes an open shift and the Manager is notified to assign a replacement.",
      links: link(ctx, "Open Roster", "/drivers/roster"),
    };
  if (has(q, "billable") && has(q, "mean", "what is", "what does", "when does", "when is", "become", "rule", "definition") && !has(q, "how many"))
    return {
      text: "A movement is **Billable** only when: it is Completed, both loading and discharge chits are verified, its driver log sheet is verified, the chits and the log agree with the terminal data, the roster and each other (anything that does not is reviewed by a person), and it has no open exception. Until then it shows Pending Completion, Pending Chits, Pending Driver Log or Blocked – Mismatch.",
    };
  if (has(q, /\bshifts?\b/) && has(q, "time", "hour", "when", "what", "how many", "long"))
    return { text: "There are two 12-hour shifts: **Morning 7:00 AM – 7:00 PM** and **Night 7:00 PM – 7:00 AM**. An operational day runs 07:00 → 07:00, so a night load after midnight belongs to the previous day." };
  if (has(q, "confidence", "auto verif", "automatic"))
    return { text: `Chits and driver logs are scored by their weakest field. At or above **${db.settings.ocrConfidenceThreshold}%** (Settings → OCR confidence threshold), and agreeing with the movement, they are verified automatically; otherwise a person verifies them.` };

  /* ------------------------------ driver users: own data only ------------------------------ */
  if (isDriver) {
    const me = ctx.driverId;
    if (has(q, /my (shift|roster|schedule)/, "next shift", "when do i work", "am i working")) {
      const rows = db.roster.filter((r) => r.driverId === me && r.date >= realToday() && (r.shift === "Morning" || r.shift === "Night")).sort((a, b) => (a.date < b.date ? -1 : 1)).slice(0, 5);
      return {
        text: rows.length ? `Your next shifts:\n${rows.map((r) => `• ${formatDay(r.date, "EEE dd MMM")} – ${r.shift}${r.primeMoverId ? ` on ${r.primeMoverId}` : ""}`).join("\n")}` : "You have no shifts rostered in the coming days.",
        links: link(ctx, "My roster", "/drivers/roster"),
      };
    }
    if (has(q, /\b(trips?|movements?|journeys?)\b/)) {
      const p = parsePeriod(q, { from: today, to: today, label: "today" });
      const n = tripsIn(db, p, (m) => m.driverId === me).length;
      return { text: `You have **${n}** trip${n === 1 ? "" : "s"} ${p.label}.`, links: link(ctx, "My movements", "/movements") };
    }
    return { text: `As a driver you can ask about your own trips and shifts, for example “How many trips today?” or “What is my next shift?”.` };
  }

  /* ------------------------------ vehicle questions ------------------------------ */
  const truck = findTruck(db, q);
  if (truck) {
    const href = `/fleet/${truck.id}`;
    const name = `${truck.id} (${truck.regNo})`;
    if (has(q, "driver", "driving", "drives", "who")) {
      const id = driverOnTruck(db, truck.id, realToday());
      return { text: id ? `**${drvName(db, id)}** is rostered on ${name} today.` : `Nobody is rostered on ${name} today.`, links: link(ctx, `Open ${truck.id}`, href) };
    }
    if (has(q, "last fuel", "last fill", "fuel pumped", "last refuel", "when was it fuel", "latest fuel")) {
      const c = vehicleCosts(db, truck.id, "2000-01-01", today);
      const f = c.lastFuel;
      if (!f) return { text: `No fuel-station invoice or manual fuel entry is recorded for ${name} yet.`, links: link(ctx, `Open ${truck.id}`, href) };
      return {
        text: `Last fuel for ${name}: **${formatDate(f.date)}** – ${formatNumber(f.litres, 1)} L${f.amount !== undefined && fin ? ` for ${money(f.amount)}` : ""}${f.station ? ` at ${f.station}` : ""}.`,
        links: link(ctx, `Open ${truck.id}`, href),
      };
    }
    if (has(q, "service", "maintenance", "repair", "workshop")) {
      const c = vehicleCosts(db, truck.id, "2000-01-01", today);
      const s = c.lastService;
      const open = c.openServices.map((o) => `${o.serviceType} (${o.status.toLowerCase()})`).join(", ");
      return {
        text: `${name}: ${s ? `last service **${formatDate(s.date)}** – ${s.serviceType}${fin ? `, ${money(s.cost)}` : ""}; next due ${formatDate(s.nextServiceDate)}.` : "no completed service logged yet."}${open ? `\nOpen: ${open}.` : ""}`,
        links: link(ctx, `Open ${truck.id}`, href),
      };
    }
    if (has(q, "spend", "spent", "cost", "expense", "money", "how much")) {
      if (!fin) return { text: "Cost information is restricted to finance roles (Manager and CEO)." };
      const p = parsePeriod(q, { from: addDays(today, -30), to: today, label: "the last 30 days" });
      const c = vehicleCosts(db, truck.id, p.from, p.to);
      return {
        text: `Spend on ${name} for ${p.label}: **${money(c.total)}**\n• Fuel: ${money(c.fuelCost)} (${formatNumber(c.fuelLitres, 1)} L, ${c.fills} fill-up${c.fills === 1 ? "" : "s"})\n• Maintenance: ${money(c.maintenanceCost)} (${c.services} service${c.services === 1 ? "" : "s"})${c.costPerTrip !== null ? `\n• About ${money(c.costPerTrip)} per trip over ${c.trips} trips` : ""}`,
        links: link(ctx, "Open spend details", href),
      };
    }
    const p = parsePeriod(q, { from: today, to: today, label: "today" });
    const n = tripsIn(db, p, (m) => m.primeMoverId === truck.id).length;
    return { text: `${name} made **${n}** trip${n === 1 ? "" : "s"} ${p.label}. Ask about its driver, fuel, service or spend too.`, links: link(ctx, `Open ${truck.id}`, href) };
  }

  /* ------------------------------ driver (person) questions ------------------------------ */
  const person = findDriver(db, q);
  if (person && !has(q, "how many drivers")) {
    const link1 = link(ctx, `Open ${person.name}`, `/drivers/${person.id}`);
    if (has(q, "shift", "roster", "today", "working", "on duty", "truck", "driving")) {
      const r = db.roster.find((x) => x.driverId === person.id && x.date === realToday());
      const work = r && (r.shift === "Morning" || r.shift === "Night");
      return { text: work ? `${person.name} works the **${r.shift}** shift today${r.primeMoverId ? ` on ${r.primeMoverId}` : ""}${r.attendance !== "Scheduled" ? ` (${r.attendance.toLowerCase()})` : ""}.` : `${person.name} is not on a shift today${r ? ` (${r.shift})` : ""}.`, links: link1 };
    }
    const p = parsePeriod(q, { from: addDays(today, -30), to: today, label: "the last 30 days" });
    const n = tripsIn(db, p, (m) => m.driverId === person.id).length;
    return { text: `${person.name} drove **${n}** trip${n === 1 ? "" : "s"} in ${p.label}.`, links: link1 };
  }

  /* ------------------------------ roster ------------------------------ */
  if (has(q, "open shift", "uncovered", "need replacement", "needs a replacement")) {
    const rows = db.openShifts;
    return { text: rows.length ? `${rows.length} open shift${rows.length === 1 ? "" : "s"} need a driver:\n${rows.slice(0, 6).map((o) => `• ${formatDay(o.date, "EEE dd MMM")} ${o.shift}${o.primeMoverId ? ` (${o.primeMoverId})` : ""} – ${o.reason}`).join("\n")}` : "There are no open shifts. 🎉", links: link(ctx, "Open Roster", "/drivers/roster") };
  }
  if (has(q, "absent", "not coming", "no show", "didn t come")) {
    const rows = db.roster.filter((r) => r.date === realToday() && r.attendance === "Absent");
    return { text: rows.length ? `Absent today:\n${rows.map((r) => `• ${drvName(db, r.driverId)} – ${r.shift}${r.absentReason ? ` (${r.absentReason})` : ""}`).join("\n")}` : "Nobody is marked absent today.", links: link(ctx, "Open Roster", "/drivers/roster") };
  }
  if (has(q, "on shift", "on duty", "who is working", "who s working", "who works", "rostered")) {
    const date = has(q, "yesterday") ? addDays(realToday(), -1) : has(q, "tomorrow") ? addDays(realToday(), 1) : realToday();
    const rows = db.roster.filter((r) => r.date === date && (r.shift === "Morning" || r.shift === "Night") && r.attendance !== "Absent");
    const part = (s: string) => rows.filter((r) => r.shift === s).map((r) => `${drvName(db, r.driverId)}${r.primeMoverId ? ` (${r.primeMoverId})` : ""}`);
    const ask = has(q, "night", "tonight") ? ["Night"] : has(q, "morning") ? ["Morning"] : ["Morning", "Night"];
    return { text: `On duty ${date === realToday() ? "today" : formatDate(date)}:\n${ask.map((s) => `• **${s}** (${part(s).length}): ${part(s).join(", ") || "nobody rostered"}`).join("\n")}`, links: link(ctx, "Open Roster", "/drivers/roster") };
  }

  /* ------------------------------ money ------------------------------ */
  if (has(q, "revenue", "income", "earn", "invoice", "invoices", "billing amount", "pay run", "driver pay", "payments awaiting", "pay awaiting", "awaiting approval", "pending approval")) {
    if (!fin) return { text: "Financial information is restricted to the Manager and CEO." };
    if (has(q, "invoice")) {
      const out = db.invoices.filter((i) => i.status === "Draft" || i.status === "Pending Approval");
      return { text: `**${out.length}** invoice${out.length === 1 ? "" : "s"} outstanding (draft or awaiting approval) worth **${money(out.reduce((s, i) => s + i.finalAmount, 0))}**.`, links: link(ctx, "Open Invoicing", "/invoicing") };
    }
    if (has(q, "pay", "awaiting approval", "pending approval")) {
      const p = pendingPayRequests(db);
      return { text: p.length ? `**${p.length}** driver pay run${p.length === 1 ? "" : "s"} awaiting Manager approval, ${money(p.reduce((s, r) => s + r.total, 0))} in total.` : "No driver pay runs are waiting for approval.", links: link(ctx, "Open Payments", "/payments") };
    }
    const p = parsePeriod(q, { from: monthRange(today.slice(0, 7)).from, to: today, label: "this month" });
    const d = buildIttAnalysis(db, p.from, p.to, true);
    return { text: `Billable revenue for ${p.label}: **${money(d.revenue?.total ?? 0)}** from ${d.totalTrips} trips (about ${money(d.revenue?.dailyAvg ?? 0)} per day).`, links: link(ctx, "Open Reports", "/reports") };
  }
  if (has(q, "fuel") && has(q, "spend", "spent", "cost", "total", "bill", "all vehicles", "fleet")) {
    if (!fin) return { text: "Cost information is restricted to finance roles (Manager and CEO)." };
    const p = parsePeriod(q, { from: addDays(today, -30), to: today, label: "the last 30 days" });
    const rows = db.primeMovers.map((v) => ({ v, c: vehicleCosts(db, v.id, p.from, p.to) })).sort((a, b) => b.c.total - a.c.total);
    const total = rows.reduce((s, r) => s + r.c.total, 0);
    const fuel = rows.reduce((s, r) => s + r.c.fuelCost, 0);
    const maint = rows.reduce((s, r) => s + r.c.maintenanceCost, 0);
    return { text: `Fleet fuel & maintenance spend for ${p.label}: **${money(total)}**\n• Fuel: ${money(fuel)}\n• Maintenance: ${money(maint)}\nHighest: ${rows.slice(0, 3).map((r) => `${r.v.id} ${money(r.c.total)}`).join(", ")}.`, links: link(ctx, "Open Fleet", "/fleet") };
  }

  /* ------------------------------ operations ------------------------------ */
  if (has(q, "exception")) {
    const open = db.exceptions.filter((e) => e.status === "Open" || e.status === "Under Review");
    const by = (p: string) => open.filter((e) => e.priority === p).length;
    return { text: `**${open.length}** open exception${open.length === 1 ? "" : "s"} (open or under review): ${by("Critical")} critical, ${by("High")} high, ${by("Medium")} medium, ${by("Low")} low.`, links: link(ctx, "Open Exceptions", "/exceptions") };
  }
  if (has(q, "driver log", "log sheet", "audit log") && has(q, "missing", "without", "need", "how many", "pending", "outstanding")) {
    const s = driverLogStats(db);
    return { text: `**${s.missing.length}** movement${s.missing.length === 1 ? "" : "s"} have no driver log yet (${s.covered} covered).${s.missing.length ? `\nOldest: ${s.missing.slice(0, 3).map((x) => `${x.movement.id} (${x.movement.primeMoverId ?? "no lorry"}, ${x.shift} ${formatDay(x.date, "dd MMM")})`).join(", ")}.` : ""}`, links: link(ctx, "Open Driver Logs", "/driver-logs") };
  }
  if (has(q, "chit") && has(q, "missing", "without", "awaiting", "need", "pending", "how many", "outstanding")) {
    const have = new Map<string, Set<string>>();
    for (const d of db.documents) if (d.movementId) have.set(d.movementId, (have.get(d.movementId) ?? new Set()).add(d.docType));
    const rows = db.movements
      .filter((m) => m.status !== "Pending")
      .map((m) => ({ m, gaps: (["Loading Chit", "Discharge Chit"] as const).filter((t) => !have.get(m.id)?.has(t)) }))
      .filter((r) => r.gaps.length);
    return {
      text: `**${rows.length}** movement${rows.length === 1 ? "" : "s"} are missing a chit.${rows.length ? `\nFor example: ${rows.slice(0, 4).map((r) => `${r.m.id} (${r.gaps.map((g) => g.replace(" Chit", "").toLowerCase()).join(" + ")})`).join(", ")}.` : ""}`,
      links: link(ctx, "Open Chits & Evidence", "/evidence"),
    };
  }
  if (has(q, "billable", "ready to bill", "ready for billing")) {
    const counts = new Map<string, number>();
    for (const m of db.movements) counts.set(billableStatus(m, db), (counts.get(billableStatus(m, db)) ?? 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return { text: `**${counts.get("Billable") ?? 0}** movements are Billable.\nOthers: ${top.filter(([k]) => k !== "Billable").map(([k, v]) => `${k} ${v}`).join(", ") || "none"}.`, links: link(ctx, "Open Movements", "/movements") };
  }
  if (has(q, /\b(trips?|movements?|journeys?|containers?|loads?)\b/, "busiest", "how many")) {
    const p = parsePeriod(q, { from: today, to: today, label: "today" });
    const list = tripsIn(db, p);
    const by = (k: string) => list.filter((m) => m.sourceTerminal === k).length;
    const morning = list.filter((m) => movementShift(m) === "Morning").length;
    const units = list.reduce((n, m) => n + m.containerNos.length, 0);
    if (has(q, "busiest", "most trips", "top truck")) {
      const t = new Map<string, number>();
      for (const m of list) if (m.primeMoverId) t.set(m.primeMoverId, (t.get(m.primeMoverId) ?? 0) + 1);
      const top = [...t.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      return { text: top.length ? `Busiest trucks ${p.label}: ${top.map(([id, n]) => `${id} (${n})`).join(", ")}.` : `No trips ${p.label}.` };
    }
    return {
      text: `**${list.length}** trip${list.length === 1 ? "" : "s"} ${p.label} (${units} container${units === 1 ? "" : "s"}).\n• By pickup: CWIT ${by("CWIT")}, SAGT ${by("SAGT")}, CICT ${by("CICT")}\n• By shift: Morning ${morning}, Night ${list.length - morning}\n• Completed: ${list.filter((m) => m.status === "Completed").length}`,
      links: link(ctx, "Open Movements", "/movements"),
    };
  }
  if (has(q, "how many drivers", "number of drivers")) {
    const active = db.drivers.filter((d) => d.status === "Active").length;
    return { text: `There are **${db.drivers.length}** drivers, ${active} active.`, links: link(ctx, "Open Drivers", "/drivers") };
  }
  if (has(q, "how many trucks", "how many vehicles", "fleet size", "number of trucks", "vehicles in maintenance", "trucks in maintenance")) {
    const m = db.primeMovers.filter((p) => p.status === "In Maintenance").map((p) => p.id);
    return { text: `The fleet has **${db.primeMovers.length}** prime movers: ${db.primeMovers.filter((p) => p.status === "Active").length} active, ${m.length} in maintenance${m.length ? ` (${m.join(", ")})` : ""}.`, links: link(ctx, "Open Fleet", "/fleet") };
  }

  return { text: `Sorry, I didn't understand that. I can only answer questions about MTS operations right now.\n\n${HELP}` };
}
