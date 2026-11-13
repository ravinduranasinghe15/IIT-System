import type { Metadata } from "next";
import { DriverProfile } from "@/components/drivers/driver-profile";

export const metadata: Metadata = { title: "Driver Profile | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <DriverProfile />;
}
