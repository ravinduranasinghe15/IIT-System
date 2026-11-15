import {
  AlertTriangle,
  BarChart3,
  Banknote,
  Database,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Receipt,
  Route,
  Settings,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export const APP_NAME = "MTS ITT Operations";
export const CLIENT_NAME = "Marine Transport Services (Pvt) Ltd";
export const VENDOR_NAME = "Techneura Labs";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description: string;
  /** Route used instead of href for Driver-role users (driver gets roster only) */
  driverHref?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, description: "Executive operational overview" },
  { key: "movements", label: "Movements", href: "/movements", icon: Route, description: "Central movement ledger" },
  { key: "terminal-imports", label: "Terminal Imports", href: "/terminal-imports", icon: FileSpreadsheet, description: "Import and validate terminal reports" },
  { key: "exceptions", label: "Exceptions", href: "/exceptions", icon: AlertTriangle, description: "Reconciliation and exception queue" },
  { key: "evidence", label: "Chits & Evidence", href: "/evidence", icon: FileText, description: "Supporting documents and assisted extraction" },
  { key: "drivers", label: "Drivers & Roster", href: "/drivers", icon: Users, description: "Driver directory, roster and attendance", driverHref: "/drivers/roster" },
  { key: "payments", label: "Driver Payments", href: "/payments", icon: Banknote, description: "15-day pay drafts and approvals" },
  { key: "invoicing", label: "Invoicing", href: "/invoicing", icon: Receipt, description: "Monthly terminal invoice drafts" },
  { key: "fleet", label: "Fleet & Fuel", href: "/fleet", icon: Truck, description: "Prime movers, fuel and servicing" },
  { key: "reports", label: "Reports & Analytics", href: "/reports", icon: BarChart3, description: "Reports, charts and exports" },
  { key: "master-data", label: "Master Data", href: "/master-data", icon: Database, description: "Terminals, routes, vehicles and rates" },
  { key: "settings", label: "Settings", href: "/settings", icon: Settings, description: "Users, roles, business rules and audit logs" },
];

export const TERMINAL_COLORS: Record<string, string> = {
  CWIT: "#315D8A",
  SAGT: "#16A36A",
  CICT: "#F59E0B",
  JCT: "#142C4C",
  ECT: "#64748B",
};

export const CHART_COLORS = {
  navy: "#142C4C",
  blue: "#315D8A",
  green: "#16A36A",
  orange: "#F59E0B",
  red: "#DC2626",
  grey: "#94A3B8",
};

export const CURRENCIES = ["AUD", "USD", "LKR", "EUR", "GBP"];

export const ASSUMPTION_NOTE =
  "Demo assumption – contractual treatment is not yet confirmed by MTS and is configurable in Settings.";

