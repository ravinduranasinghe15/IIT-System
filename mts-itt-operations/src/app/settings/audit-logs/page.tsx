import type { Metadata } from "next";
import { AuditLogsView } from "@/components/settings/audit-logs-view";

export const metadata: Metadata = { title: "Audit Logs | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <AuditLogsView />;
}
