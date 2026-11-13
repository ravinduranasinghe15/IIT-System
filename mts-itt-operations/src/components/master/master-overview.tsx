"use client";

import Link from "next/link";
import { Anchor, ArrowRight, Boxes, Container, Receipt, Route, Truck, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";

interface Card {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  count: string;
  visible: boolean;
}

export function MasterOverview() {
  const { db } = useApp();
  const { can } = useAuth();
  const edit = can("master.edit");
  const activeOf = <T extends { status: string }>(xs: T[]) => xs.filter((x) => x.status === "Active").length;

  const cards: Card[] = [
    { href: "/master-data/terminals", title: "Terminals", description: "CWIT, SAGT, CICT (conditional), JCT destination, ECT (not operational).", icon: Anchor, count: `${db.terminals.length} terminals · ${activeOf(db.terminals)} active`, visible: edit },
    { href: "/master-data/routes", title: "Routes", description: "Valid source-destination pairs, route codes and status.", icon: Route, count: `${db.routes.length} routes · ${activeOf(db.routes)} active`, visible: edit },
    { href: "/master-data/containers", title: "Container types", description: "20FT / 40FT definitions, TEU and per-journey limits.", icon: Container, count: `${db.containerTypes.length} sizes · ${activeOf(db.containerTypes)} active`, visible: edit },
    { href: "/master-data/vehicles", title: "Prime movers", description: "Fleet register with trailer and driver assignments.", icon: Truck, count: `${db.primeMovers.length} vehicles · ${activeOf(db.primeMovers)} active`, visible: edit },
    { href: "/master-data/trailers", title: "Trailers", description: "Skeletal trailers and prime mover assignments.", icon: Boxes, count: `${db.trailers.length} trailers · ${db.trailers.filter((t) => t.primeMoverId).length} assigned`, visible: edit },
    { href: "/master-data/rates", title: "Rates", description: "Effective-dated route and size rates with diesel adjustment.", icon: Receipt, count: `${db.rates.length} rate records · ${activeOf(db.rates)} active`, visible: edit || can("rates.edit") },
  ];

  return (
    <div>
      <PageHeader title="Master Data" description="Reference data used across movements, imports, payments and invoicing. Every change is audit-logged." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards
          .filter((c) => c.visible)
          .map((c) => (
            <Link key={c.href} href={c.href} className="group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm transition hover:border-brand/40 hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-lg bg-navy/10 text-navy">
                  <c.icon className="size-5" />
                </div>
                <ArrowRight className="size-4 text-slate transition group-hover:translate-x-0.5 group-hover:text-brand" />
              </div>
              <div>
                <div className="text-sm font-semibold text-navy">{c.title}</div>
                <p className="mt-0.5 text-sm text-slate">{c.description}</p>
              </div>
              <div className="mt-auto text-xs font-medium text-ink">{c.count}</div>
            </Link>
          ))}
      </div>
    </div>
  );
}
