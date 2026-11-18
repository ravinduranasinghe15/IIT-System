"use client";

import { Suspense, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Lock } from "lucide-react";
import { MtsLogo } from "@/components/shared/mts-logo";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/shared/loading-state";
import { EmptyState } from "@/components/shared/empty-state";
import { DriverPhoneFrame, DriverBottomNav, isMobileRole, useIsEmbedded, useIsDesktop } from "./driver-phone-frame";
import { SidebarContent } from "./app-sidebar";
import { AppHeader } from "./app-header";
import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { useAppState } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { cn } from "@/lib/utils";

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { role, canAccess, isDriver } = useAuth();
  const [collapsed, setCollapsed] = useLocalStorage("mts-itt-sidebar-collapsed", false);
  const [mobile, setMobile] = useState(false);
  const allowed = canAccess(pathname);
  const embedded = useIsEmbedded();
  const desktop = useIsDesktop();

  // Drivers and supervisors use the system on a phone: on desktop, show a live phone-sized preview.
  const phoneRole = isMobileRole(role);
  if (phoneRole && !embedded && desktop) return <DriverPhoneFrame />;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className={cn("no-print hidden shrink-0 transition-[width] duration-200 md:block", collapsed ? "w-[68px]" : "w-60")}>
        <SidebarContent collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      </aside>
      <Sheet open={mobile} onOpenChange={setMobile}>
        <SheetContent side="left" className="w-64 border-0 p-0" showCloseButton={false}>
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarContent collapsed={false} onNavigate={() => setMobile(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onMenu={() => setMobile(true)} />
        <main className={cn("scroll-thin flex-1 overflow-y-auto p-4 pb-24 md:p-6 md:pb-24", phoneRole && "pb-36")}>
          <div className="mx-auto max-w-[1500px]">
            <Suspense fallback={<LoadingState />}>
              {allowed ? (
                children
              ) : (
                <div className="mx-auto max-w-md rounded-xl border bg-card py-6 shadow-sm">
                  <EmptyState
                    icon={Lock}
                    title="Access restricted for this demo role"
                    description={`The ${role} role does not have access to this module. Use the role switcher in the header to view it as a different user. (Frontend demo permissions only.)`}
                    action={
                      <Button render={<Link href={isDriver ? "/drivers/roster" : "/dashboard"} />} variant="outline">
                        Go to {isDriver ? "my roster" : "dashboard"}
                      </Button>
                    }
                  />
                </div>
              )}
            </Suspense>
          </div>
        </main>
      </div>
      {phoneRole && <DriverBottomNav />}
      <AssistantWidget liftForTabBar={phoneRole} />
    </div>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { ready } = useAppState();
  if (!ready)
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-background">
        <MtsLogo className="size-16 rounded-xl" pulse />
        <div className="text-sm text-slate">Loading MTS ITT Operations demo…</div>
      </div>
    );
  return <Shell>{children}</Shell>;
}
