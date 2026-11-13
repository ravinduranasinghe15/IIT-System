import type { Metadata } from "next";
import { InvoicingView } from "@/components/invoicing/invoicing-view";

export const metadata: Metadata = { title: "Invoicing | MTS ITT Operations" };
export const instant = false;

export default function InvoicingPage() {
  return <InvoicingView />;
}
