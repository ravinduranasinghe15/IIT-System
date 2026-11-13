import type { Metadata } from "next";
import { RosterView } from "@/components/drivers/roster-view";

export const metadata: Metadata = { title: "Driver Roster | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <RosterView />;
}
