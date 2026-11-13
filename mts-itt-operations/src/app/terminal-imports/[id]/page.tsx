import type { Metadata } from "next";
import { ImportDetailView } from "@/components/imports/import-detail";

export const metadata: Metadata = { title: "Import Details | MTS ITT Operations" };
export const instant = false;

export default function TerminalImportDetailPage() {
  return <ImportDetailView />;
}
