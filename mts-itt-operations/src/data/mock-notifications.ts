import type { AppNotification, AuditLog } from "@/types/user";

export const MOCK_NOTIFICATIONS: AppNotification[] = [
  { id: "NT-0001", title: "Critical exception open", body: "Damaged container reported on a 40FT movement – review required before billing.", at: "2026-11-13T09:40", level: "critical", href: "/exceptions", read: false },
  { id: "NT-0002", title: "Terminal import completed with issues", body: "SAGT daily report processed – invalid rows retained for review.", at: "2026-11-13T08:15", level: "warning", href: "/terminal-imports", read: false },
  { id: "NT-0003", title: "Fuel variance above threshold", body: "PM-003 shows +13% invoice vs GPS fuel variance for October.", at: "2026-11-12T17:20", level: "warning", href: "/fleet/fuel", read: false },
  { id: "NT-0004", title: "Pay draft ready for review", body: "Pay period 31 Oct – 14 Nov draft generated. Approval pending.", at: "2026-11-13T09:10", level: "info", href: "/payments", read: true },
  { id: "NT-0005", title: "Invoice awaiting approval", body: "MTS-202611-SAGT-001 submitted for manager approval.", at: "2026-11-13T09:05", level: "info", href: "/invoicing", read: true },
  { id: "NT-0006", title: "Maintenance: PM-006", body: "Prime mover PM-006 is in the workshop (gearbox repair).", at: "2026-11-11T14:00", level: "info", href: "/fleet", read: true },
];

export const SEED_AUDIT: Omit<AuditLog, "id">[] = [
  { userId: "U-001", userName: "Hasini Jayawardena", role: "Administrator", action: "User Login (simulated)", module: "Auth", at: "2026-11-13T07:12", description: "Demo login for Hasini Jayawardena." },
  { userId: "U-003", userName: "Nadeesha Perera", role: "Operations Staff", action: "File Imported", module: "Terminal Imports", at: "2026-11-13T08:03", description: "Imported CWIT_Daily_Report_2026-11-12.xlsx." },
  { userId: "U-004", userName: "Ranjith Herath", role: "Supervisor", action: "Chit Verified", module: "Evidence", at: "2026-11-12T20:10", description: "Verified assisted-extraction values on a loading chit." },
  { userId: "U-002", userName: "Dinesh Kumarasinghe", role: "Operations Manager", action: "Exception Resolved", module: "Exceptions", at: "2026-11-11T12:30", description: "Resolved a damaged-container exception after evidence review.", financial: true },
  { userId: "U-005", userName: "Shalini de Silva", role: "Finance Manager", action: "Rate Updated", module: "Master Data", at: "2026-10-01T08:00", description: "Activated October 2026 route rate card (effective 2026-10-01).", financial: true },
  { userId: "U-001", userName: "Hasini Jayawardena", role: "Administrator", action: "Payment Approved", module: "Payments", at: "2026-10-17T14:00", description: "Approved pay run for 01 Oct – 15 Oct (simulated).", financial: true },
  { userId: "U-001", userName: "Hasini Jayawardena", role: "Administrator", action: "Payment Approved", module: "Payments", at: "2026-11-01T14:00", description: "Approved pay run for 16 Oct – 30 Oct (simulated).", financial: true },
  { userId: "U-001", userName: "Hasini Jayawardena", role: "Administrator", action: "Invoice Approved", module: "Invoicing", at: "2026-11-04T15:30", description: "Approved invoice MTS-202610-CWIT-001.", financial: true },
  { userId: "U-001", userName: "Hasini Jayawardena", role: "Administrator", action: "Invoice Approved", module: "Invoicing", at: "2026-11-06T14:10", description: "Approved invoice MTS-202610-SAGT-001.", financial: true },
  { userId: "U-002", userName: "Dinesh Kumarasinghe", role: "Operations Manager", action: "Master Data Updated", module: "Master Data", at: "2026-11-02T09:30", description: "Marked CICT as conditional pending sample report validation." },
  { userId: "U-003", userName: "Nadeesha Perera", role: "Operations Staff", action: "File Imported", module: "Fleet", at: "2026-11-13T08:20", description: "Imported Track My Car file TrackMyCar_Fuel_Trips_2026-11-12.csv." },
];
