export type DriverStatus = "Active" | "On Leave" | "Suspended" | "Inactive";
export type ShiftType = "Morning" | "Night" | "Rotating";

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

export type RosterShift = "Morning" | "Night" | "Off" | "Leave";
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
