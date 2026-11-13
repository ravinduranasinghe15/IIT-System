"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, CircleDollarSign, Clock, FilePlus2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { SectionCard } from "@/components/shared/section-card";
import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect } from "@/components/shared/native-select";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { formatMonth } from "@/lib/date-utils";
import { deleteInvoiceDraft } from "@/lib/mutations/invoice";
import { formatMoney } from "@/lib/utils";
import type { Invoice } from "@/types/invoice";
import { InvoiceTable } from "./invoice-table";
import { RateManagement } from "./rate-management";

export function InvoicingView() {
  const { db, update } = useApp();
  const { can, canSeeFinancials } = useAuth();
  const [q, setQ] = useState("");
  const [terminal, setTerminal] = useState("");
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState("");
  const [toDelete, setToDelete] = useState<Invoice | null>(null);

  const currency = db.settings.currency;
  const months = useMemo(() => [...new Set(db.invoices.map((i) => i.month))].sort().reverse(), [db.invoices]);
  const rows = useMemo(
    () =>
      db.invoices.filter(
        (i) =>
          (!q || i.invoiceNo.toLowerCase().includes(q.toLowerCase())) &&
          (!terminal || i.terminal === terminal) &&
          (!month || i.month === month) &&
          (!status || i.status === status),
      ),
    [db.invoices, q, terminal, month, status],
  );

  if (!canSeeFinancials) return null;
  const count = (s: Invoice["status"]) => db.invoices.filter((i) => i.status === s).length;
  const totalValue = db.invoices.reduce((s, i) => s + i.finalAmount, 0);

  return (
    <div>
      <PageHeader
        title="Invoicing"
        description="Monthly terminal invoice drafts from eligible billable movements and effective-dated route rates. Drafts stay drafts until an authorised manager approves; nothing is posted to an ERP."
        actions={
          can("invoice.manage") && (
            <Button render={<Link href="/invoicing/new" />} nativeButton={false}>
              <FilePlus2 /> New invoice draft
            </Button>
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Invoice Drafts" value={count("Draft")} icon={FileText} tone="orange" />
        <StatCard label="Pending Approval" value={count("Pending Approval")} icon={Clock} tone="blue" />
        <StatCard label="Approved Invoices" value={count("Approved") + count("Exported")} icon={CheckCircle2} tone="green" hint={`${count("Exported")} exported`} />
        <StatCard label="Total Invoice Value" value={formatMoney(totalValue, currency)} icon={CircleDollarSign} tone="navy" hint="All statuses (demo)" />
      </div>

      <Tabs defaultValue="invoices" className="mt-4">
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="rates">Rate master</TabsTrigger>
        </TabsList>
        <TabsContent value="invoices">
          <SectionCard
            title="Invoices"
            bodyClassName="p-0"
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <SearchInput value={q} onChange={setQ} placeholder="Invoice no…" className="w-44" />
                <NativeSelect className="w-28" value={terminal} onValueChange={setTerminal} placeholder="Terminal" options={["CWIT", "SAGT", "CICT"]} aria-label="Terminal" />
                <NativeSelect className="w-40" value={month} onValueChange={setMonth} placeholder="All months" options={months.map((m) => ({ value: m, label: formatMonth(m) }))} aria-label="Billing month" />
                <NativeSelect className="w-40" value={status} onValueChange={setStatus} placeholder="All statuses" options={["Draft", "Pending Approval", "Approved", "Exported"]} aria-label="Status" />
              </div>
            }
          >
            <InvoiceTable invoices={rows} onDelete={can("invoice.manage") ? setToDelete : undefined} />
          </SectionCard>
        </TabsContent>
        <TabsContent value="rates">
          <RateManagement />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Delete invoice draft?"
        description={toDelete ? `${toDelete.invoiceNo} will be removed and its movements become billable again.` : undefined}
        confirmLabel="Delete draft"
        destructive
        onConfirm={() => {
          if (!toDelete) return;
          const res = update((d) => deleteInvoiceDraft(d, toDelete.id));
          if (res.ok) toast.success(`${toDelete.invoiceNo} deleted`);
          else toast.error(res.error);
        }}
      />
    </div>
  );
}
