import type { Metadata } from "next";
import { VehiclesView } from "@/components/master/vehicles-view";

export const metadata: Metadata = { title: "Prime Movers | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <VehiclesView />;
}
