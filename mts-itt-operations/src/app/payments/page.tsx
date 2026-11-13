import type { Metadata } from "next";
import { PaymentsView } from "@/components/payments/payments-view";

export const metadata: Metadata = { title: "Driver Payments | MTS ITT Operations" };
export const instant = false;

export default function PaymentsPage() {
  return <PaymentsView />;
}
