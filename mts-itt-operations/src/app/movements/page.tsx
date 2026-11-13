import type { Metadata } from "next";
import { MovementsView } from "@/components/movements/movements-view";

export const metadata: Metadata = { title: "Movements | MTS ITT Operations" };
export const instant = false;

export default function MovementsPage() {
  return <MovementsView />;
}
