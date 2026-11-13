import type { Metadata } from "next";
import { MovementDetails } from "@/components/movements/movement-details";

export const metadata: Metadata = { title: "Movement Details | MTS ITT Operations" };
export const instant = false;

export default function MovementDetailPage() {
  return <MovementDetails />;
}
