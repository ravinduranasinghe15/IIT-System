import type { Driver, LeaveRecord, RosterEntry, RosterShift } from "@/types/driver";
import type { AppUser } from "@/types/user";
import { addDays, eachDay } from "@/lib/date-utils";
import { MIN_REST_HOURS, ROSTER_DAYS_AHEAD, ROSTER_DAYS_BACK, restGapHours, type WorkShift } from "@/lib/roster-rules";

const NAMES = [
  "Nuwan Perera", "Kasun Fernando", "Sampath Jayasinghe", "Chaminda Silva", "Ruwan Wickramasinghe",
  "Dilan Rathnayake", "Pradeep Kumara", "Lakmal Gunawardena", "Janaka Bandara", "Thushara Madushanka",
  "Asanka Weerasinghe", "Isuru Senanayake", "Mahesh Dissanayake", "Roshan Abeysekara",
];
const SHIFTS: Driver["shift"][] = NAMES.map(() => "Rotating");

export const dr = (n: number) => `DR-${String(n).padStart(3, "0")}`;
export const pm = (n: number) => `PM-${String(n).padStart(3, "0")}`;

/** Only used to lay out the demo roster: which truck each driver is usually rostered on. Drivers are NOT tied to a truck – the roster (and any Manager) can put any driver on any truck. */
const TRUCK_OF: string[] = [...Array.from({ length: 9 }, (_, k) => pm(k + 1)), pm(3), pm(4), pm(7), pm(9), pm(3)];

export const MOCK_DRIVERS: Driver[] = NAMES.map((name, i) => ({
  id: dr(i + 1),
  name,
  phone: `+94 77 ${String(210 + i * 7).padStart(3, "0")} ${String(4000 + i * 311).slice(0, 4)}`,
  licenseNo: `B ${String(4521876 + i * 9131).slice(0, 7)}`,
  licenseExpiry: `${2027 + (i % 4)}-${String((i * 3) % 12 + 1).padStart(2, "0")}-15`,
  status: "Active",
  shift: SHIFTS[i],
  joinedAt: `${2018 + (i % 7)}-0${(i % 9) + 1}-01`,
  address: `${12 + i * 3}, Galle Road, ${["Colombo 03", "Dehiwala", "Moratuwa", "Wattala", "Kelaniya", "Mount Lavinia", "Peliyagoda"][i % 7]}`,
  emergencyContact: `+94 71 ${String(800 + i * 13).padStart(3, "0")} ${String(1200 + i * 97).slice(0, 4)}`,
}));

export const MOCK_USERS: AppUser[] = [
  { id: "U-001", name: "Hasini Jayawardena", email: "hasini.j@mts-demo.lk", role: "Manager", status: "Active", lastLogin: "2026-11-13T07:12" },
  { id: "U-002", name: "Dinesh Kumarasinghe", email: "dinesh.k@mts-demo.lk", role: "CEO", status: "Active", lastLogin: "2026-11-13T07:45" },
  { id: "U-003", name: "Nadeesha Perera", email: "nadeesha.p@mts-demo.lk", role: "Manager", status: "Active", lastLogin: "2026-11-13T08:03" },
  { id: "U-004", name: "Ranjith Herath", email: "ranjith.h@mts-demo.lk", role: "Supervisor", status: "Active", lastLogin: "2026-11-13T07:01" },
  { id: "U-005", name: "Shalini de Silva", email: "shalini.d@mts-demo.lk", role: "Manager", status: "Active", lastLogin: "2026-11-12T16:40" },
  { id: "U-006", name: "Sampath Jayasinghe", email: "sampath.j@mts-demo.lk", role: "Driver", status: "Active", driverId: "DR-003", lastLogin: "2026-11-13T06:50" },
  { id: "U-007", name: "Tharindu Gamage", email: "tharindu.g@mts-demo.lk", role: "Manager", status: "Active", lastLogin: "2026-11-12T19:22" },
  { id: "U-008", name: "Kumudu Ekanayake", email: "kumudu.e@mts-demo.lk", role: "Supervisor", status: "Active", lastLogin: "2026-11-12T19:05" },
  { id: "U-009", name: "Kasun Fernando", email: "kasun.f@mts-demo.lk", role: "Driver", status: "Disabled", driverId: "DR-002", lastLogin: "2026-10-30T18:15" },
];

export const MOCK_LEAVES: LeaveRecord[] = [
  { id: "LV-0001", driverId: "DR-012", from: "2026-11-09", to: "2026-11-15", type: "Annual", reason: "Family event", status: "Approved", requestedAt: "2026-11-02T10:00", decidedBy: "Dinesh Kumarasinghe" },
  { id: "LV-0002", driverId: "DR-007", from: "2026-11-11", to: "2026-11-12", type: "Sick", reason: "Medical certificate provided", status: "Approved", requestedAt: "2026-11-11T06:30", decidedBy: "Ranjith Herath" },
  { id: "LV-0003", driverId: "DR-004", from: "2026-11-18", to: "2026-11-19", type: "Casual", reason: "Personal matter", status: "Pending", requestedAt: "2026-11-12T14:20" },
  { id: "LV-0004", driverId: "DR-009", from: "2026-10-20", to: "2026-10-22", type: "Annual", reason: "Travel", status: "Approved", requestedAt: "2026-10-10T09:00", decidedBy: "Dinesh Kumarasinghe" },
  { id: "LV-0005", driverId: "DR-002", from: "2026-10-05", to: "2026-10-05", type: "Sick", reason: "Fever", status: "Approved", requestedAt: "2026-10-05T05:55", decidedBy: "Ranjith Herath" },
];

/**
 * Seeded roster that follows the roster rules:
 *  - two 12-hour shifts (Morning / Night); one shift per driver per day;
 *  - drivers are not tied to a truck (the demo layout below just reuses a usual truck per driver); a truck has one driver per shift;
 *  - exactly one day off per week (6 working days, then 1 day off);
 *  - weekly rotation Morning ↔ Night, never with less than the minimum rest.
 */
const ROSTER_HISTORY_FROM = "2026-10-13";
export function buildRoster(today: string): RosterEntry[] {
  const out: RosterEntry[] = [];
  const CYCLE: WorkShift[] = ["Morning", "Night"];
  const prev = new Map<string, { date: string; shift: WorkShift }>();
  let n = 0;
  // the roster reaches back to the start of the demo terminal reports (13 Oct) so imported movements can find their driver
  const from = addDays(today, -ROSTER_DAYS_BACK) < ROSTER_HISTORY_FROM ? addDays(today, -ROSTER_DAYS_BACK) : ROSTER_HISTORY_FROM;
  eachDay(from, addDays(today, ROSTER_DAYS_AHEAD)).forEach((date, dayIdx) => {
    const week = Math.floor(dayIdx / 7);
    const taken = new Set<string>(); // `${truck}|${shift}` already driven today
    MOCK_DRIVERS.forEach((d, i) => {
      let shift: RosterShift = "Off";
      const off = (dayIdx + (i % 7)) % 7 === 6;
      if (!off) {
        const preferred = CYCLE[(week + i) % 2];
        const order = [preferred, ...CYCLE.filter((c) => c !== preferred)];
        const p = prev.get(d.id);
        const rested = (c: WorkShift) => !p || p.date !== addDays(date, -1) || restGapHours(p.date, p.shift, date, c) >= MIN_REST_HOURS;
        const pick = order.find((c) => rested(c) && !taken.has(`${TRUCK_OF[i]}|${c}`));
        if (pick) {
          shift = pick;
          taken.add(`${TRUCK_OF[i]}|${pick}`);
          prev.set(d.id, { date, shift: pick });
        }
      }
      const working = shift !== "Off";
      let attendance: RosterEntry["attendance"] = "Scheduled";
      if (working && date < today) attendance = (dayIdx * 7 + i * 3) % 23 === 0 ? "Absent" : (dayIdx + i * 5) % 11 === 0 ? "Late" : "Present";
      if (working && date === today && shift === "Morning") attendance = "Present";
      n += 1;
      out.push({
        id: `RS-${String(n).padStart(4, "0")}`,
        driverId: d.id,
        date,
        shift,
        primeMoverId: working ? TRUCK_OF[i] : null,
        attendance,
        recordedBy: attendance === "Scheduled" ? undefined : "Ranjith Herath",
      });
    });
  });

  // Demo day (13 Nov): the four drivers on the chit pack are rostered on their trucks for the Morning shift, so the roster,
  // the chits and the driver logs all name the same people. The day before is a rest day (no Night -> Morning clash) and
  // anyone else on those trucks that Morning steps off.
  const at = (id: string, date: string) => out.find((r) => r.driverId === id && r.date === date);
  for (const [drv, truck] of DEMO_MORNING) {
    for (const r of out) if (r.date === DEMO_DAY && r.shift === "Morning" && r.primeMoverId === truck && r.driverId !== drv) Object.assign(r, { shift: "Off", primeMoverId: null, attendance: "Scheduled", recordedBy: undefined });
    const prevDay = at(drv, addDays(DEMO_DAY, -1));
    if (prevDay) Object.assign(prevDay, { shift: "Off", primeMoverId: null, attendance: "Scheduled", recordedBy: undefined });
    const e = at(drv, DEMO_DAY);
    if (e) Object.assign(e, { shift: "Morning", primeMoverId: truck, attendance: DEMO_DAY < today ? "Present" : e.attendance, recordedBy: DEMO_DAY < today ? "Ranjith Herath" : undefined });
  }
  return out;
}

const DEMO_DAY = "2026-11-13";
/** [driver, truck] on the Morning shift of the demo day: Nuwan / LY-5516, Kasun / LY-5519, Ruwan / LY-5525, Lakmal / LY-6181 */
const DEMO_MORNING: [string, string][] = [["DR-001", "PM-001"], ["DR-002", "PM-002"], ["DR-005", "PM-005"], ["DR-008", "PM-008"]];

export { addDays };
