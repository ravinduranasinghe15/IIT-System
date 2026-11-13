import type { Metadata } from "next";
import { MovementNewView } from "@/components/movements/movement-new-view";

export const metadata: Metadata = { title: "Register Movement | MTS ITT Operations" };
export const instant = false;

export default function NewMovementPage() {
  return <MovementNewView />;
}
