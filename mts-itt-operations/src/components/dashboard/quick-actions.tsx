"use client";

import Link from "next/link";
import { AlertTriangle, Banknote, FileSpreadsheet, PlusCircle, Receipt, type LucideIcon } from "lucide-react";
import { SectionCard } from "@/components/shared/section-card";
import { useAuth } from "@/contexts/auth-context";
import type { ActionKey } from "@/lib/permissions";

const ACTIONS: { label: string; href: string; icon: LucideIcon; hint: string; can?: ActionKey; path: string }[] = [
  { label: "Import Terminal Report", href: "/terminal-imports/new", icon: FileSpreadsheet, hint: "CWIT, SAGT, CICT files", can: "import.run", path: "/terminal-imports" },
  { label: "Register Movement", href: "/movements/new", icon: PlusCircle, hint: "Manual journey entry", can: "movement.create", path: "/movements" },
  { label: "Review Exceptions", href: "/exceptions", icon: AlertTriangle, hint: "Reconciliation queue", path: "/exceptions" },
  { label: "Generate Pay Draft", href: "/payments?action=generate", icon: Banknote, hint: "15-day driver pay", can: "payments.manage", path: "/payments" },
  { label: "Create Invoice Draft", href: "/invoicing/new", icon: Receipt, hint: "Monthly terminal invoice", can: "invoice.manage", path: "/invoicing" },
];

export function QuickActions() {
  const { can, canAccess } = useAuth();
  const items = ACTIONS.filter((a) => canAccess(a.path) && (!a.can || can(a.can)));
  return (
    <SectionCard title="Quick actions" description="Common tasks for your role">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {items.map((a) => (
          <Link key={a.href} href={a.href} className="flex items-center gap-3 rounded-lg border bg-background p-2.5 transition hover:border-brand/50 hover:bg-muted/50">
            <span className="flex size-8 items-center justify-center rounded-md bg-brand/10 text-brand">
              <a.icon className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{a.label}</span>
              <span className="block truncate text-xs text-slate">{a.hint}</span>
            </span>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
