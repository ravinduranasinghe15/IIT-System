import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Settings | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <SettingsView />;
}
