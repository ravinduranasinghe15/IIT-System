import type { Metadata } from "next";
import { InvoiceForm } from "@/components/invoicing/invoice-form";

export const metadata: Metadata = { title: "New Invoice Draft | MTS ITT Operations" };
export const instant = false;

export default function NewInvoicePage() {
  return <InvoiceForm />;
}
