export type DriverStatus = "Active" | "On Leave" | "Suspended" | "Inactive";
export type ShiftType = "Morning" | "Afternoon" | "Night" | "Rotating";

export interface Driver {
  id: string;
  name: string;
  phone: string;
  licenseNo: string;
  licenseExpiry: string;
  primeMoverId: string | null;
  status: DriverStatus;
  shift: ShiftType;
  joinedAt: string;
  address: string;
  emergencyContact: string;
}

export type RosterShift = "Morning" | "Afternoon" | "Night" | "Off" | "Leave";
export type AttendanceStatus = "Scheduled" | "Present" | "Absent" | "Late";

export interface RosterEntry {
  id: string;
  driverId: string;
  /** yyyy-MM-dd (start date of the shift; night shift ends 07:00 next day) */
  date: string;
  shift: RosterShift;
  primeMoverId: string | null;
  attendance: AttendanceStatus;
  recordedBy?: string;
  /** Absent driver: the driver who took over this shift */
  coveredBy?: string;
  /** Replacement driver: the absent driver whose shift this is */
  coveringFor?: string;
}

/** A rostered shift that lost its driver (approved leave) and still needs someone assigned. */
export interface OpenShift {
  id: string;
  date: string;
  shift: "Morning" | "Afternoon" | "Night";
  primeMoverId: string | null;
  /** Driver who was rostered and is now away */
  driverId: string;
  reason: string;
  createdAt: string;
}

export interface LeaveRecord {
  id: string;
  driverId: string;
  from: string;
  to: string;
  type: "Annual" | "Sick" | "Casual" | "Unpaid";
  reason: string;
  status: "Pending" | "Approved" | "Rejected";
  requestedAt: string;
  decidedBy?: string;
}
