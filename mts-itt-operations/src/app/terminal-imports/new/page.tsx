import type { Metadata } from "next";
import { ImportWizard } from "@/components/imports/import-wizard";

export const metadata: Metadata = { title: "New Terminal Import | MTS ITT Operations" };
export const instant = false;

export default function NewTerminalImportPage() {
  return <ImportWizard />;
}
