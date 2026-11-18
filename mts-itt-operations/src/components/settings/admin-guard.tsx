"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useAuth } from "@/contexts/auth-context";

/** Settings pages are Manager-only (`settings.manage`). Demo permissions, not security. */
export function AdminGuard({ children }: { children: ReactNode }) {
  const { can } = useAuth();
  if (can("settings.manage")) return <>{children}</>;
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card py-6 shadow-sm">
      <EmptyState
        icon={Lock}
        title="Manager only"
        description="Settings, user management, role matrix and audit logs are limited to the Manager demo role."
        action={
          <Button render={<Link href="/dashboard" />} variant="outline">
            Go to dashboard
          </Button>
        }
      />
    </div>
  );
}
