import type { Metadata } from "next";
import { VehicleDetailView } from "@/components/fleet/vehicle-detail-view";

export const metadata: Metadata = { title: "Vehicle | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <VehicleDetailView />;
}
