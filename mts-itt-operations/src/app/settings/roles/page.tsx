import type { Metadata } from "next";
import { RolesView } from "@/components/settings/roles-view";

export const metadata: Metadata = { title: "Role Access | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <RolesView />;
}
