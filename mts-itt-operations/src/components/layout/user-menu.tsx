"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, History, RotateCcw, Settings } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useAuth } from "@/contexts/auth-context";
import { useApp } from "@/contexts/app-context";
import { ROLES, type Role } from "@/types/user";
import { NativeSelect } from "@/components/shared/native-select";
import { initials } from "@/lib/utils";

export function UserMenu() {
  const { user, role, can, setRole } = useAuth();
  const { reset } = useApp();
  const router = useRouter();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1 text-left outline-none transition hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/40"
          aria-label="User menu"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white">{initials(user.name)}</span>
          <span className="hidden min-w-0 leading-tight lg:block">
            <span className="block max-w-32 truncate text-xs font-medium text-ink">{user.name}</span>
            <span className="block text-[10px] text-slate">{role}</span>
          </span>
          <ChevronDown className="size-3.5 text-slate" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <div className="px-2 py-1.5">
            <div className="text-sm font-medium text-ink">{user.name}</div>
            <div className="text-xs text-slate">{user.email}</div>
            <div className="mt-1 text-[11px] text-slate">Demo role: {role}</div>
          </div>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 sm:hidden">
            <div className="mb-1 text-[11px] text-slate">Switch demo role</div>
            <NativeSelect value={role} onValueChange={(v) => setRole(v as Role)} options={[...ROLES]} aria-label="Switch demo role (menu)" />
          </div>
          <DropdownMenuSeparator className="sm:hidden" />
          {can("settings.manage") && (
            <>
              <DropdownMenuItem onClick={() => router.push("/settings")}>
                <Settings /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/settings/audit-logs")}>
                <History /> Audit logs
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          {role !== "Driver" ? (
            <DropdownMenuItem onClick={() => setConfirmReset(true)}>
              <RotateCcw /> Reset demo data
            </DropdownMenuItem>
          ) : (
            <div className="px-2 py-1.5 text-xs text-slate">Driver view: own movements and roster only.</div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset demo data?"
        description="All changes you made (imports, movements, approvals, settings) will be discarded and the original sample dataset restored."
        confirmLabel="Reset data"
        destructive
        onConfirm={() => {
          reset();
          toast.success("Demo data reset to the original sample dataset");
          router.push("/dashboard");
        }}
      />
    </>
  );
}
