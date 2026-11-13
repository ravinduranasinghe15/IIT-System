import type { Metadata } from "next";
import { InvoiceDetail } from "@/components/invoicing/invoice-detail";

export const metadata: Metadata = { title: "Invoice | MTS ITT Operations" };
export const instant = false;

export default function InvoicePage() {
  return <InvoiceDetail />;
}
