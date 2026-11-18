import type { DB } from "@/types/db";
import type { Driver, LeaveRecord, RosterEntry } from "@/types/driver";
import type { AppUser } from "@/types/user";
import { addDays, eachDay } from "@/lib/date-utils";
import { generateRoster } from "@/lib/roster-generator";
import { ROSTER_DAYS_AHEAD, ROSTER_DAYS_BACK } from "@/lib/roster-rules";
import { MOCK_PRIME_MOVERS } from "./mock-vehicles";

const NAMES = [
  "Nuwan Perera", "Kasun Fernando", "Sampath Jayasinghe", "Chaminda Silva", "Ruwan Wickramasinghe",
  "Dilan Rathnayake", "Pradeep Kumara", "Lakmal Gunawardena", "Janaka Bandara", "Thushara Madushanka",
  "Asanka Weerasinghe", "Isuru Senanayake", "Mahesh Dissanayake", "Roshan Abeysekara",
  // six more drivers so that every active truck can run both shifts every day (see buildRoster)
  "Prasanna Jayasuriya", "Gayan Ekanayake", "Sudath Ranatunga", "Nimal Herath", "Tharaka Liyanage", "Buddhika Samarasinghe",
];
const SHIFTS: Driver["shift"][] = NAMES.map(() => "Rotating");

export const dr = (n: number) => `DR-${String(n).padStart(3, "0")}`;
export const pm = (n: number) => `PM-${String(n).padStart(3, "0")}`;

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
 * Seeded roster, built by the same generator the Manager uses (lib/roster-generator.ts):
 *  - two 12-hour shifts (Morning / Night); EVERY active truck runs both shifts every day (8 trucks x 2 = 16 driver-shifts);
 *  - one shift per driver per day, at least 8 hours' rest, at least one day off in every 7 days, weekly Morning <-> Night rotation;
 *  - drivers are not tied to a truck; a truck has one driver per shift.
 * With 20 drivers that is possible (16 shifts a day needs about 19-20 drivers under these rules).
 */
const ROSTER_HISTORY_FROM = "2026-10-13";
const DEMO_DAY = "2026-11-13";
/** [driver, truck] on the Morning shift of the demo day: Nuwan / LY-5516, Kasun / LY-5519, Ruwan / LY-5525, Lakmal / LY-6181 */
const DEMO_MORNING: [string, string][] = [["DR-001", "PM-001"], ["DR-002", "PM-002"], ["DR-005", "PM-005"], ["DR-008", "PM-008"]];

export function buildRoster(today: string): RosterEntry[] {
  // the roster reaches back to the start of the demo terminal reports (13 Oct) so imported movements can find their driver
  const from = addDays(today, -ROSTER_DAYS_BACK) < ROSTER_HISTORY_FROM ? addDays(today, -ROSTER_DAYS_BACK) : ROSTER_HISTORY_FROM;
  const to = addDays(today, ROSTER_DAYS_AHEAD);
  const days = eachDay(from, to);

  // Demo day (13 Nov): the four drivers on the chit pack are rostered on their trucks for the Morning shift, so the roster,
  // the chits and the driver logs all name the same people. The day before is the same Morning shift (so there is no Night -> Morning clash).
  const pins: Omit<RosterEntry, "id">[] = DEMO_MORNING.flatMap(([driverId, truck]) => [
    { driverId, date: addDays(DEMO_DAY, -1), shift: "Morning" as const, primeMoverId: truck, attendance: "Present" as const, recordedBy: "Ranjith Herath" },
    { driverId, date: DEMO_DAY, shift: "Morning" as const, primeMoverId: truck, attendance: (DEMO_DAY < today ? "Present" : "Scheduled") as RosterEntry["attendance"], recordedBy: DEMO_DAY < today ? "Ranjith Herath" : undefined },
  ]);
  const activeTrucks = MOCK_PRIME_MOVERS.filter((p) => p.status === "Active").length;
  const seedDb = { drivers: MOCK_DRIVERS, primeMovers: MOCK_PRIME_MOVERS, roster: pins.map((p, i) => ({ id: `PIN-${i}`, ...p })) } as unknown as DB;
  const gen = generateRoster(
    seedDb,
    { start: from, days: days.length, mode: "week", perShift: { Morning: activeTrucks, Night: activeTrucks }, daily: {}, excludedTrucks: [], apply: "fill" },
    from,
  );

  const dayIdx = new Map(days.map((d, i) => [d, i]));
  const driverIdx = new Map(MOCK_DRIVERS.map((d, i) => [d.id, i]));
  const all = [...pins, ...gen.entries].sort((a, b) => (a.date === b.date ? a.driverId.localeCompare(b.driverId) : a.date < b.date ? -1 : 1));
  return all.map((e, n): RosterEntry => {
    const working = e.shift === "Morning" || e.shift === "Night";
    let attendance = e.attendance;
    if (working && attendance === "Scheduled" && e.date < today) {
      const di = dayIdx.get(e.date) ?? 0;
      const i = driverIdx.get(e.driverId) ?? 0;
      attendance = (di * 7 + i * 3) % 23 === 0 ? "Absent" : (di + i * 5) % 11 === 0 ? "Late" : "Present";
    }
    if (working && e.date === today && e.shift === "Morning") attendance = "Present";
    return { ...e, id: `RS-${String(n + 1).padStart(4, "0")}`, attendance, recordedBy: e.recordedBy ?? (attendance === "Scheduled" ? undefined : "Ranjith Herath") };
  });
}

export { addDays };
