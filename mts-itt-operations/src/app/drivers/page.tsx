import type { Metadata } from "next";
import { DriversView } from "@/components/drivers/drivers-view";

export const metadata: Metadata = { title: "Drivers | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <DriversView />;
}
