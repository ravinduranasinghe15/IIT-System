import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";

export const metadata: Metadata = { title: "Dashboard | MTS ITT Operations" };
export const instant = false;

export default function DashboardPage() {
  return <DashboardView />;
}
