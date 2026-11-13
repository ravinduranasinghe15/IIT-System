import type { Metadata } from "next";
import { PayRunDetail } from "@/components/payments/payment-details";

export const metadata: Metadata = { title: "Pay Run | MTS ITT Operations" };
export const instant = false;

export default function PayRunPage() {
  return <PayRunDetail />;
}
