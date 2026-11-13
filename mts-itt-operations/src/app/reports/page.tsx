import type { Metadata } from "next";
import { ReportsView } from "@/components/reports/reports-view";

export const metadata: Metadata = { title: "Reports & Analytics | MTS ITT Operations" };
export const instant = false;

export default function ReportsPage() {
  return <ReportsView />;
}
