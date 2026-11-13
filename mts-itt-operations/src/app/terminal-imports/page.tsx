import type { Metadata } from "next";
import { ImportHistoryView } from "@/components/imports/import-history";

export const metadata: Metadata = { title: "Terminal Imports | MTS ITT Operations" };
export const instant = false;

export default function TerminalImportsPage() {
  return <ImportHistoryView />;
}
