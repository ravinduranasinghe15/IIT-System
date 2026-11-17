import type { Metadata } from "next";
import { DriverLogsView } from "@/components/driver-logs/driver-logs-view";

export const metadata: Metadata = { title: "Driver Logs | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <DriverLogsView />;
}
