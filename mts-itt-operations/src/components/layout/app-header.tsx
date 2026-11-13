"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bell, CalendarClock, Menu, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/shared/native-select";
import { Breadcrumb, titleForPath } from "./breadcrumb";
import { UserMenu } from "./user-menu";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { ROLES, type Role } from "@/types/user";
import { demoToday, formatDay, formatDateTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

interface Hit {
  type: string;
  label: string;
  sub: string;
  href: string;
}

function GlobalSearch() {
  const { db } = useApp();
  const { canAccess, isDriver, driverId } = useAuth();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const hits = useMemo<Hit[]>(() => {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: Hit[] = [];
    if (canAccess("/movements"))
      for (const m of db.movements) {
        if (isDriver && m.driverId !== driverId) continue;
        if (m.id.toLowerCase().includes(s) || m.containerNos.some((c) => c.toLowerCase().includes(s)))
          out.push({ type: "Movement", label: m.id, sub: `${m.containerNos.join(" + ")} · ${m.sourceTerminal}→${m.destinationTerminal}`, href: `/movements/${m.id}` });
      }
    if (canAccess("/exceptions"))
      for (const e of db.exceptions)
        if (e.id.toLowerCase().includes(s) || e.containerNo.toLowerCase().includes(s) || e.type.toLowerCase().includes(s))
          out.push({ type: "Exception", label: e.id, sub: `${e.type} · ${e.movementId}`, href: `/exceptions/${e.id}` });
    if (canAccess("/drivers"))
      for (const d of db.drivers)
        if (d.id.toLowerCase().includes(s) || d.name.toLowerCase().includes(s))
          out.push({ type: "Driver", label: d.name, sub: d.id, href: `/drivers/${d.id}` });
    if (canAccess("/fleet"))
      for (const p of db.primeMovers)
        if (p.id.toLowerCase().includes(s) || p.regNo.toLowerCase().includes(s))
          out.push({ type: "Vehicle", label: p.id, sub: p.regNo, href: `/fleet/${p.id}` });
    if (canAccess("/terminal-imports"))
      for (const i of db.imports)
        if (i.id.toLowerCase().includes(s) || i.fileName.toLowerCase().includes(s))
          out.push({ type: "Import", label: i.id, sub: i.fileName, href: `/terminal-imports/${i.id}` });
    if (canAccess("/invoicing"))
      for (const i of db.invoices)
        if (i.invoiceNo.toLowerCase().includes(s)) out.push({ type: "Invoice", label: i.invoiceNo, sub: i.status, href: `/invoicing/${i.id}` });
    return out.slice(0, 8);
  }, [q, db, canAccess, isDriver, driverId]);

  return (
    <div ref={box} className="relative hidden w-full max-w-xs md:block">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate" />
      <Input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
        placeholder="Search movements, containers, drivers…"
        className="h-8 pl-8"
        aria-label="Global search"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border bg-popover shadow-lg">
          {hits.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate">No results for “{q}”.</div>
          ) : (
            hits.map((h) => (
              <button
                key={h.type + h.href}
                type="button"
                onClick={() => {
                  setOpen(false);
                  setQ("");
                  router.push(h.href);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted"
              >
                <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-brand">{h.type}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium text-ink">{h.label}</span>
                  <span className="block truncate text-xs text-slate">{h.sub}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function Notifications() {
  const { db, update } = useApp();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const unread = db.notifications.filter((n) => !n.read).length;
  const dot: Record<string, string> = { critical: "bg-danger", warning: "bg-warning", info: "bg-brand", success: "bg-success" };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label="Notifications" />}>
        <Bell />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-semibold text-white">{unread}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold text-navy">Notifications</span>
          <button
            type="button"
            disabled={unread === 0}
            className="text-xs text-brand hover:underline disabled:opacity-40"
            onClick={() => update((d) => d.notifications.forEach((n) => (n.read = true)))}
          >
            Mark all read
          </button>
        </div>
        <div className="scroll-thin max-h-96 overflow-y-auto">
          {db.notifications.length === 0 && <div className="px-3 py-6 text-center text-sm text-slate">You&apos;re all caught up.</div>}
          {db.notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => {
                update((d) => {
                  const t = d.notifications.find((x) => x.id === n.id);
                  if (t) t.read = true;
                });
                setOpen(false);
                if (n.href) router.push(n.href);
              }}
              className={cn("flex w-full gap-2.5 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted", !n.read && "bg-brand/5")}
            >
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", dot[n.level])} />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-ink">{n.title}</span>
                <span className="block text-xs text-slate">{n.body}</span>
                <span className="mt-0.5 block text-[11px] text-slate/80">{formatDateTime(n.at)}</span>
              </span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function AppHeader({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { role, setRole } = useAuth();
  const { db } = useApp();
  return (
    <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b bg-card px-3 md:px-5">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onMenu} aria-label="Open navigation">
        <Menu />
      </Button>
      <div className="min-w-0 flex-1 md:flex-none md:basis-64">
        <div className="truncate text-sm font-semibold leading-tight text-navy">{titleForPath(pathname)}</div>
        <Breadcrumb />
      </div>
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden items-center gap-1.5 rounded-lg border bg-muted/50 px-2.5 py-1 text-xs xl:flex" title={`Operational reporting cycle ${String(db.settings.opDayStartHour).padStart(2, "0")}:00 to ${String(db.settings.opDayStartHour).padStart(2, "0")}:00 (${db.settings.timezone})`}>
          <CalendarClock className="size-3.5 text-brand" />
          <span className="font-medium text-ink">{formatDay(demoToday(), "EEE, dd MMM yyyy")}</span>
          <span className="text-slate">· 07:00–07:00</span>
        </div>
        <div className="hidden items-center gap-1.5 sm:flex">
          <span className="hidden text-xs text-slate lg:inline">Demo role</span>
          <NativeSelect
            className="w-44"
            value={role}
            onValueChange={(v) => setRole(v as Role)}
            options={[...ROLES]}
            aria-label="Switch demo role"
          />
        </div>
        <Notifications />
        <UserMenu />
      </div>
    </header>
  );
}
