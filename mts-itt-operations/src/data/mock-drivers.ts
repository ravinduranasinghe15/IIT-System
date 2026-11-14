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

export const MOCK_DRIVERS: Driver[] = NAMES.map((name, i) => ({
  id: dr(i + 1),
  name,
  phone: `+94 77 ${String(210 + i * 7).padStart(3, "0")} ${String(4000 + i * 311).slice(0, 4)}`,
  licenseNo: `B ${String(4521876 + i * 9131).slice(0, 7)}`,
  licenseExpiry: `${2027 + (i % 4)}-${String((i * 3) % 12 + 1).padStart(2, "0")}-15`,
  primeMoverId: i < 9 ? pm(i + 1) : null,
  status: "Active",
  shift: SHIFTS[i],
  joinedAt: `${2018 + (i % 7)}-0${(i % 9) + 1}-01`,
  address: `${12 + i * 3}, Galle Road, ${["Colombo 03", "Dehiwala", "Moratuwa", "Wattala", "Kelaniya", "Mount Lavinia", "Peliyagoda"][i % 7]}`,
  emergencyContact: `+94 71 ${String(800 + i * 13).padStart(3, "0")} ${String(1200 + i * 97).slice(0, 4)}`,
}));

export const MOCK_USERS: AppUser[] = [
  { id: "U-001", name: "Hasini Jayawardena", email: "hasini.j@mts-demo.lk", role: "Administrator", status: "Active", lastLogin: "2026-11-13T07:12" },
  { id: "U-002", name: "Dinesh Kumarasinghe", email: "dinesh.k@mts-demo.lk", role: "Operations Manager", status: "Active", lastLogin: "2026-11-13T07:45" },
  { id: "U-003", name: "Nadeesha Perera", email: "nadeesha.p@mts-demo.lk", role: "Operations Staff", status: "Active", lastLogin: "2026-11-13T08:03" },
  { id: "U-004", name: "Ranjith Herath", email: "ranjith.h@mts-demo.lk", role: "Supervisor", status: "Active", lastLogin: "2026-11-13T07:01" },
  { id: "U-005", name: "Shalini de Silva", email: "shalini.d@mts-demo.lk", role: "Finance Manager", status: "Active", lastLogin: "2026-11-12T16:40" },
  { id: "U-006", name: "Sampath Jayasinghe", email: "sampath.j@mts-demo.lk", role: "Driver", status: "Active", driverId: "DR-003", lastLogin: "2026-11-13T06:50" },
  { id: "U-007", name: "Tharindu Gamage", email: "tharindu.g@mts-demo.lk", role: "Operations Staff", status: "Active", lastLogin: "2026-11-12T19:22" },
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
 *  - three 8-hour shifts (Morning / Afternoon / Night); one shift per driver per day;
 *  - 6 working days then 1 day off (every driver has a day off every week);
 *  - weekly rotation through Morning → Night → Afternoon, never with less than the minimum rest;
 *  - a different truck from the day before, and no truck on two drivers' shifts at once.
 */
export function buildRoster(today: string): RosterEntry[] {
  const out: RosterEntry[] = [];
  const CYCLE: WorkShift[] = ["Morning", "Night", "Afternoon"];
  const TARGET_PER_SHIFT = 4;
  const prevShift = new Map<string, { date: string; shift: WorkShift; truck: string | null }>();
  let n = 0;
  eachDay(addDays(today, -ROSTER_DAYS_BACK), addDays(today, ROSTER_DAYS_AHEAD)).forEach((date, dayIdx) => {
    const week = Math.floor(dayIdx / 7);
    const count: Record<WorkShift, number> = { Morning: 0, Afternoon: 0, Night: 0 };
    const usedTrucks: Record<WorkShift, Set<string>> = { Morning: new Set(), Afternoon: new Set(), Night: new Set() };
    MOCK_DRIVERS.forEach((d, i) => {
      const off = (dayIdx + (i % 7)) % 7 === 6;
      let shift: RosterShift = "Off";
      let primeMoverId: string | null = null;
      if (!off) {
        const preferred = CYCLE[(week + i) % 3];
        const order = [preferred, ...CYCLE.filter((c) => c !== preferred)];
        const prev = prevShift.get(d.id);
        const rested = (c: WorkShift) => !prev || prev.date !== addDays(date, -1) || restGapHours(prev.date, prev.shift, date, c) >= MIN_REST_HOURS;
        const pick = order.find((c) => rested(c) && count[c] < TARGET_PER_SHIFT) ?? order.find((c) => rested(c)) ?? "Afternoon";
        shift = pick;
        count[pick] += 1;
        const start = (i * 3 + dayIdx * 2) % 9;
        for (let k = 0; k < 9; k++) {
          const t = pm(((start + k) % 9) + 1);
          if (!usedTrucks[pick].has(t) && t !== prev?.truck) {
            primeMoverId = t;
            break;
          }
        }
        if (primeMoverId) usedTrucks[pick].add(primeMoverId);
        prevShift.set(d.id, { date, shift: pick, truck: primeMoverId });
      }
      const working = shift !== "Off";
      let attendance: RosterEntry["attendance"] = "Scheduled";
      if (working && date < today) attendance = (dayIdx * 7 + i * 3) % 23 === 0 ? "Absent" : (dayIdx + i * 5) % 11 === 0 ? "Late" : "Present";
      if (working && date === today && shift === "Morning") attendance = "Present";
      n += 1;
      out.push({ id: `RS-${String(n).padStart(4, "0")}`, driverId: d.id, date, shift, primeMoverId, attendance, recordedBy: attendance === "Scheduled" ? undefined : "Ranjith Herath" });
    });
  });
  return out;
}

export { addDays };
