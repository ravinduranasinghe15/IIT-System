import type { Metadata } from "next";
import { RatesView } from "@/components/master/rates-view";

export const metadata: Metadata = { title: "Rates | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <RatesView />;
}
