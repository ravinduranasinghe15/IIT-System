"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Ship } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { cn, initials } from "@/lib/utils";
import { useAuth } from "@/contexts/auth-context";
import { usePendingPayRequestCount } from "@/components/payments/pending-requests";

function isActive(pathname: string, href: string, key: string) {
  if (key === "drivers") return pathname.startsWith("/drivers");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarContent({
  collapsed,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { user, role, isDriver, canAccess } = useAuth();
  const pendingPay = usePendingPayRequestCount();
  const items = NAV_ITEMS.filter((n) => canAccess(isDriver && n.driverHref ? n.driverHref : n.href));

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex items-center gap-2.5 border-b border-sidebar-border px-4 py-4", collapsed && "justify-center px-2")}>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success text-white">
          <Ship className="size-5" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold text-white">MTS ITT Operations</div>
            <div className="truncate text-[11px] text-slate-400">by Techneura Labs</div>
          </div>
        )}
      </div>
      {!collapsed && (
        <div className="px-4 pt-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            <span className="size-1.5 rounded-full bg-warning" /> Demo environment
          </span>
        </div>
      )}
      <nav className="scroll-thin mt-2 flex-1 space-y-0.5 overflow-y-auto px-2 py-2" aria-label="Main navigation">
        {items.map((n) => {
          const href = isDriver && n.driverHref ? n.driverHref : n.href;
          const active = isActive(pathname, href, n.key);
          const Icon = n.icon;
          return (
            <Link
              key={n.key}
              href={href}
              onClick={onNavigate}
              title={collapsed ? n.label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                collapsed && "justify-center px-2",
                active ? "bg-sidebar-accent text-white shadow-sm ring-1 ring-white/10" : "hover:bg-sidebar-accent/60 hover:text-white",
              )}
            >
              <Icon className={cn("size-[18px] shrink-0", active && "text-success")} />
              {!collapsed && <span className="truncate">{n.label}</span>}
              {n.key === "payments" && pendingPay > 0 && (role === "Administrator" || role === "Finance Manager") && (
                <span
                  className={cn("flex size-5 shrink-0 items-center justify-center rounded-full bg-warning text-[11px] font-semibold text-white", collapsed ? "absolute -right-0.5 -top-0.5 size-4 text-[10px]" : "ml-auto")}
                  title={`${pendingPay} payment request(s) waiting for approval`}
                >
                  {pendingPay}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className={cn("border-t border-sidebar-border p-3", collapsed && "px-2")}>
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-white">{initials(user.name)}</div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-medium text-white">{user.name}</div>
              <div className="truncate text-[11px] text-slate-400">{role}</div>
            </div>
          )}
        </div>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-1.5 text-xs text-slate-400 transition hover:bg-sidebar-accent/60 hover:text-white"
          >
            {collapsed ? <ChevronsRight className="size-4" /> : <><ChevronsLeft className="size-4" /> Collapse</>}
          </button>
        )}
      </div>
    </div>
  );
}
