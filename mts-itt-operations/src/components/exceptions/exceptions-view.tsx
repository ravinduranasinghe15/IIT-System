"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, FilterX, ScanSearch, XCircle, Flame } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/shared/section-card";
import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect } from "@/components/shared/native-select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { EMPTY_EXCEPTION_FILTERS, filterExceptions, useExceptions, type ExceptionFilters } from "@/hooks/use-exceptions";
import { EXCEPTION_TYPES } from "@/types/exception";
import { TERMINAL_CODES } from "@/types/terminal";
import { ExceptionTable } from "./exception-table";

export function ExceptionsView() {
  const { db } = useApp();
  const { can } = useAuth();
  const { exceptions, kpis, runReconciliation } = useExceptions();
  const [filters, setFilters] = useState<ExceptionFilters>(EMPTY_EXCEPTION_FILTERS);
  const [confirmScan, setConfirmScan] = useState(false);

  const set = <K extends keyof ExceptionFilters>(k: K, v: ExceptionFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const filtered = useMemo(() => filterExceptions(exceptions, filters), [exceptions, filters]);
  const active = (Object.keys(filters) as (keyof ExceptionFilters)[]).some((k) => filters[k] !== EMPTY_EXCEPTION_FILTERS[k]);
  const assignees = useMemo(() => [...new Set(exceptions.map((e) => e.assignedTo).filter((a): a is string => !!a))].sort(), [exceptions]);

  return (
    <div>
      <PageHeader
        title="Exceptions"
        description="Reconciliation queue. Unresolved exceptions block billing; financially material corrections need manager approval."
        actions={
          can("exception.review") && (
            <Button variant="outline" onClick={() => setConfirmScan(true)}>
              <ScanSearch /> Run evidence reconciliation
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-5 xl:grid-cols-5">
        <StatCard label="Total" value={kpis.total} icon={AlertTriangle} tone="navy" onClick={() => setFilters(EMPTY_EXCEPTION_FILTERS)} />
        <StatCard label="Critical" value={kpis.critical} hint="Open / in review" icon={Flame} tone="red" onClick={() => setFilters({ ...EMPTY_EXCEPTION_FILTERS, priority: "Critical" })} />
        <StatCard label="Pending Review" value={kpis.pending} hint="Open + under review" icon={Clock} tone="orange" onClick={() => setFilters({ ...EMPTY_EXCEPTION_FILTERS, status: "__pending" })} />
        <StatCard label="Resolved" value={kpis.resolved} hint={kpis.awaitingApproval ? `${kpis.awaitingApproval} awaiting approval` : undefined} icon={CheckCircle2} tone="green" onClick={() => setFilters({ ...EMPTY_EXCEPTION_FILTERS, status: "Resolved" })} />
        <StatCard label="Rejected" value={kpis.rejected} icon={XCircle} tone="grey" onClick={() => setFilters({ ...EMPTY_EXCEPTION_FILTERS, status: "Rejected" })} />
      </div>
      <SectionCard bodyClassName="p-0">
        <div className="flex flex-wrap items-end gap-2 border-b p-3">
          <SearchInput value={filters.search} onChange={(v) => set("search", v)} placeholder="Search exception, movement or container…" className="w-full sm:w-72" />
          <NativeSelect className="w-52" value={filters.type} onValueChange={(v) => set("type", v)} placeholder="All types" options={EXCEPTION_TYPES} aria-label="Type" />
          <NativeSelect className="w-32" value={filters.priority} onValueChange={(v) => set("priority", v)} placeholder="Priority" options={["Critical", "High", "Medium", "Low"]} aria-label="Priority" />
          <NativeSelect className="w-36" value={filters.status} onValueChange={(v) => set("status", v)} placeholder="All statuses" options={[{ value: "__pending", label: "Open + Under Review" }, "Open", "Under Review", "Resolved", "Rejected"]} aria-label="Status" />
          <NativeSelect className="w-32" value={filters.terminal} onValueChange={(v) => set("terminal", v)} placeholder="Terminal" options={TERMINAL_CODES} aria-label="Source terminal" />
          <NativeSelect
            className="w-44"
            value={filters.assignee}
            onValueChange={(v) => set("assignee", v)}
            placeholder="Any assignee"
            options={[{ value: "__none", label: "Unassigned" }, ...assignees.map((a) => ({ value: a, label: a }))]}
            aria-label="Assignee"
          />
          {active && (
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_EXCEPTION_FILTERS)}>
              <FilterX /> Clear
            </Button>
          )}
        </div>
        <ExceptionTable rows={filtered} />
      </SectionCard>
      <p className="mt-3 text-xs text-slate">
        Manager approval requirement: {db.settings.requireManagerApproval ? "enabled" : "disabled"} (demo setting). Billing, pay and invoicing exclude any movement with an Open or Under Review exception.
      </p>
      <ConfirmDialog
        open={confirmScan}
        onOpenChange={setConfirmScan}
        title="Run evidence reconciliation?"
        description="Scans completed movements from previous operational days for missing loading/discharge chits and raises exceptions where evidence is absent."
        confirmLabel="Run scan"
        onConfirm={() => {
          const n = runReconciliation();
          if (n > 0) toast.warning(`${n} new exception(s) raised`, { description: "Missing chit evidence detected." });
          else toast.success("Scan complete – no new exceptions");
        }}
      />
    </div>
  );
}
