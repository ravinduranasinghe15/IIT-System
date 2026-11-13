import type { Metadata } from "next";
import { RoutesView } from "@/components/master/routes-view";

export const metadata: Metadata = { title: "Routes | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <RoutesView />;
}
