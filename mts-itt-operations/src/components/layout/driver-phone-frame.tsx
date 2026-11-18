"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, ClipboardList, FileText, LayoutDashboard, Route, Smartphone, Users } from "lucide-react";
import { NativeSelect } from "@/components/shared/native-select";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { ROLES, type Role } from "@/types/user";
import { cn } from "@/lib/utils";

const noop = () => () => {};

/** True when this app instance is running inside the phone-preview iframe. */
export function useIsEmbedded(): boolean {
  return useSyncExternalStore(noop, () => window.self !== window.top, () => false);
}

/** True for viewports at the md breakpoint and wider. */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => true,
  );
}

/**
 * Desktop view for the mobile-first roles (Driver, Supervisor): the real app rendered in a phone-sized iframe, so every
 * responsive breakpoint behaves exactly as it would on their phone. Data is shared through
 * localStorage (the context listens for storage events).
 */
export const isMobileRole = (role: Role) => role === "Driver" || role === "Supervisor";

export function DriverPhoneFrame() {
  const { role, setRole, user } = useAuth();
  const src = "/dashboard";
  return (
    <div className="flex h-dvh flex-col items-center gap-3 overflow-y-auto bg-slate-900 px-4 py-4">
      <div className="flex w-full max-w-xl flex-wrap items-center justify-center gap-3 rounded-xl bg-slate-800 px-4 py-2 text-sm text-slate-200">
        <Smartphone className="size-4 text-success" />
        <span>
          {role} mobile view · <span className="font-medium text-white">{user.name}</span>
        </span>
        <span className="text-xs text-slate-400">Demo role</span>
        <NativeSelect className="w-44" value={role} onValueChange={(v) => setRole(v as Role)} options={[...ROLES]} aria-label="Switch demo role" />
        <Button size="sm" variant="secondary" onClick={() => setRole("Manager")}>
          Exit to desktop
        </Button>
      </div>
      <div className="relative shrink-0 rounded-[3rem] border-[10px] border-black bg-black shadow-2xl" style={{ width: 390 + 20, height: "min(844px, calc(100dvh - 7rem))" }}>
        <div className="absolute left-1/2 top-0 z-10 h-5 w-28 -translate-x-1/2 rounded-b-2xl bg-black" />
        <iframe title={`${role} mobile app preview`} src={src} className="size-full rounded-[2.2rem] bg-background" />
      </div>
      <p className="text-xs text-slate-400">
        {role === "Driver" ? "Live phone-sized preview – drivers see only their own movements and roster, with no financial data." : "Live phone-sized preview – supervisors work from their phone: chits, driver logs, attendance and exceptions."}
      </p>
    </div>
  );
}

const DRIVER_TABS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/movements", label: "Movements", icon: Route },
  { href: "/drivers/roster", label: "Roster", icon: CalendarDays },
];
const SUPERVISOR_TABS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/movements", label: "Movements", icon: Route },
  { href: "/evidence", label: "Chits", icon: FileText },
  { href: "/driver-logs", label: "Logs", icon: ClipboardList },
  { href: "/drivers", label: "Drivers", icon: Users },
];

/** Bottom tab bar shown to drivers and supervisors on phone-sized screens (supervisors reach Exceptions from the menu). */
export function DriverBottomNav() {
  const pathname = usePathname();
  const { role } = useAuth();
  const TABS = role === "Supervisor" ? SUPERVISOR_TABS : DRIVER_TABS;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-card shadow-[0_-2px_8px_rgba(0,0,0,0.06)] md:hidden" aria-label={`${role} navigation`}>
      {TABS.map((t) => {
        const active = pathname === t.href || pathname.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium", active ? "text-navy" : "text-slate")}>
            <t.icon className={cn("size-5", active && "text-success")} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
