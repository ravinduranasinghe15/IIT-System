import type { Metadata } from "next";
import { ExceptionsView } from "@/components/exceptions/exceptions-view";

export const metadata: Metadata = { title: "Exceptions | MTS ITT Operations" };
export const instant = false;

export default function ExceptionsPage() {
  return <ExceptionsView />;
}
