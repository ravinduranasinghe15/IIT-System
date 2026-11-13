import type { Metadata } from "next";
import { ContainersView } from "@/components/master/containers-view";

export const metadata: Metadata = { title: "Container Types | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <ContainersView />;
}
