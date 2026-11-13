import type { Metadata } from "next";
import { EvidenceView } from "@/components/evidence/evidence-view";

export const metadata: Metadata = { title: "Chits & Evidence | MTS ITT Operations" };
export const instant = false;

export default function EvidencePage() {
  return <EvidenceView />;
}
