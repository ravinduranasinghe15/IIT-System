import type { Metadata } from "next";
import { FleetView } from "@/components/fleet/fleet-view";

export const metadata: Metadata = { title: "Fleet | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <FleetView />;
}
