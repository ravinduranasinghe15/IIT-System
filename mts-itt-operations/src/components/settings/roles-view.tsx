"use client";

import { Check, Minus, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { AdminGuard } from "./admin-guard";
import { NAV_ITEMS } from "@/lib/constants";
import { ACTIONS, ROLE_DESCRIPTIONS, ROLE_ROUTES, canAccess, canSeeFinancials, type ActionKey } from "@/lib/permissions";
import { ROLES, type Role } from "@/types/user";

const EXTRA_ROUTES = [
  { label: "Driver Roster", href: "/drivers/roster" },
  { label: "Rate Master", href: "/master-data/rates" },
];

const ACTION_LABELS: Record<ActionKey, string> = {
  "movement.create": "Register movements",
  "movement.edit": "Edit movements",
  "movement.approve": "Approve movement corrections",
  "import.run": "Run terminal imports",
  "exception.review": "Review exceptions",
  "exception.approve": "Approve material corrections",
  "evidence.upload": "Upload evidence documents",
  "evidence.verify": "Verify extracted evidence",
  "driver.manage": "Manage drivers",
  "roster.edit": "Edit roster and leave",
  "roster.attendance": "Record attendance",
  "fleet.manage": "Manage fleet and service logs",
  "fuel.review": "Review fuel reconciliation",
  "payments.manage": "Generate driver pay drafts",
  "payments.approve": "Approve driver payments",
  "invoice.manage": "Create invoice drafts",
  "invoice.approve": "Approve invoices",
  "master.edit": "Edit master data",
  "rates.edit": "Edit rates",
  "settings.manage": "Settings, users and audit logs",
  "reports.view": "View reports",
};

function Mark({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20" aria-label="Allowed">
      <Check className="size-3.5" />
    </span>
  ) : (
    <span className="inline-flex size-5 items-center justify-center text-slate-300" aria-label="Not allowed">
      <Minus className="size-3.5" />
    </span>
  );
}

function Matrix({ rows }: { rows: { key: string; label: string; has: (r: Role) => boolean }[] }) {
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-slate">
            <th className="sticky left-0 bg-muted px-4 py-2.5 text-left">Capability</th>
            {ROLES.map((r) => (
              <th key={r} className="whitespace-nowrap px-3 py-2.5 text-center">
                {r}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t">
              <td className="sticky left-0 bg-card px-4 py-2 font-medium text-ink">{row.label}</td>
              {ROLES.map((r) => (
                <td key={r} className="px-3 py-2 text-center">
                  <Mark on={row.has(r)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RolesView() {
  const moduleRows = [
    ...NAV_ITEMS.map((n) => ({ key: n.href, label: `${n.label} (${n.href})`, has: (r: Role) => canAccess(r, n.href) })),
    ...EXTRA_ROUTES.map((n) => ({ key: n.href, label: `${n.label} (${n.href})`, has: (r: Role) => canAccess(r, n.href) })),
  ];
  const actionRows = (Object.keys(ACTIONS) as ActionKey[]).map((a) => ({ key: a, label: ACTION_LABELS[a] ?? a, has: (r: Role) => (ACTIONS[a] as Role[]).includes(r) }));
  const financeRow = [{ key: "fin", label: "See financial figures (pay, invoices, rates, billable status)", has: (r: Role) => canSeeFinancials(r) }];

  return (
    <AdminGuard>
      <PageHeader title="Role access matrix" description="Read-only view of which demo roles can open each module and perform each action." />
      <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <p>
          These are <strong>frontend demo permissions</strong>, not production security. Roles only change what the demo UI shows; a production system would enforce access on the server.
        </p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r} className="rounded-xl border bg-card p-3.5 shadow-sm">
            <div className="text-sm font-semibold text-navy">{r}</div>
            <p className="mt-0.5 text-xs text-slate">{ROLE_DESCRIPTIONS[r]}</p>
            <p className="mt-1.5 truncate text-xs text-slate">
              Routes: <span className="text-ink">{ROLE_ROUTES[r].join(", ")}</span>
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-5">
        <SectionCard title="Module access" description="Derived from ROLE_ROUTES" bodyClassName="p-0">
          <Matrix rows={moduleRows} />
        </SectionCard>
        <SectionCard title="Actions" description="Derived from ACTIONS" bodyClassName="p-0">
          <Matrix rows={[...actionRows, ...financeRow]} />
        </SectionCard>
      </div>
    </AdminGuard>
  );
}
