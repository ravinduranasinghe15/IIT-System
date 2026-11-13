import type { Metadata } from "next";
import { MasterOverview } from "@/components/master/master-overview";

export const metadata: Metadata = { title: "Master Data | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <MasterOverview />;
}
