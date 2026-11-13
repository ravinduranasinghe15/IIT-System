import type { Metadata } from "next";
import { FuelView } from "@/components/fleet/fuel-view";

export const metadata: Metadata = { title: "Fuel & Reconciliation | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <FuelView />;
}
