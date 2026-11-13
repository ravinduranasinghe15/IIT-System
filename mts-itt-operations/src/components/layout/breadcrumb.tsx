"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";

const LABELS: Record<string, string> = {
  new: "New",
  roster: "Roster",
  fuel: "Fuel",
  "audit-logs": "Audit Logs",
  users: "Users",
  roles: "Roles & Access",
  terminals: "Terminals",
  routes: "Routes",
  containers: "Containers",
  vehicles: "Prime Movers",
  trailers: "Trailers",
  rates: "Rates",
};

export function titleForPath(pathname: string): string {
  const parts = pathname.split("/").filter(Boolean);
  if (!parts.length) return "Dashboard";
  const nav = NAV_ITEMS.find((n) => n.href === `/${parts[0]}`);
  if (parts.length === 1) return nav?.label ?? parts[0];
  const last = parts[parts.length - 1];
  return LABELS[last] ?? `${nav?.label ?? parts[0]} · ${last.toUpperCase()}`;
}

export function Breadcrumb() {
  const pathname = usePathname();
  const parts = pathname.split("/").filter(Boolean);
  const crumbs = parts.map((p, i) => {
    const href = `/${parts.slice(0, i + 1).join("/")}`;
    const nav = i === 0 ? NAV_ITEMS.find((n) => n.href === href) : undefined;
    return { href, label: nav?.label ?? LABELS[p] ?? decodeURIComponent(p) };
  });
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-xs text-slate">
      <Link href="/dashboard" className="flex items-center hover:text-ink" aria-label="Home">
        <Home className="size-3.5" />
      </Link>
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="size-3 shrink-0" />
          {i === crumbs.length - 1 ? (
            <span className="truncate font-medium text-ink">{c.label}</span>
          ) : (
            <Link href={c.href} className="truncate hover:text-ink">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
