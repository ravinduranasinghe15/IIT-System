import type { Metadata } from "next";
import { DriverNewView } from "@/components/drivers/driver-new-view";

export const metadata: Metadata = { title: "Register Driver | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <DriverNewView />;
}
