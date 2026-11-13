import type { Metadata } from "next";
import { ExceptionDetails } from "@/components/exceptions/exception-details";

export const metadata: Metadata = { title: "Exception Details | MTS ITT Operations" };
export const instant = false;

export default function ExceptionDetailPage() {
  return <ExceptionDetails />;
}
