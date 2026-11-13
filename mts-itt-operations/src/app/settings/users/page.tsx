import type { Metadata } from "next";
import { UsersView } from "@/components/settings/users-view";

export const metadata: Metadata = { title: "User Management | MTS ITT Operations" };
export const instant = false;

export default function Page() {
  return <UsersView />;
}
