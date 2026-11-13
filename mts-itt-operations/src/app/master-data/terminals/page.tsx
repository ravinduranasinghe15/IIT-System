import type { Metadata } from "next";
import { TerminalsView } from "@/components/master/terminals-view";

export const metadata: Metadata = { title: "Terminals | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <TerminalsView />;
}
