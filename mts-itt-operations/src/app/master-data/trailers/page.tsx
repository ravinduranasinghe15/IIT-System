import type { Metadata } from "next";
import { TrailersView } from "@/components/master/trailers-view";

export const metadata: Metadata = { title: "Trailers | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <TrailersView />;
}
