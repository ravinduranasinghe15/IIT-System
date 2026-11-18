"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Check, CheckCircle2, Download, FileDown, Printer, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard, KeyValue } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable } from "@/components/shared/data-table";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { invoiceBreakdown } from "@/lib/invoice-calculator";
import { approveInvoice, deleteInvoiceDraft, invoiceCsvRows, markInvoiceExported, submitInvoice } from "@/lib/mutations/invoice";
import { downloadCsv } from "@/lib/export-utils";
import { formatDateTime, formatMonth } from "@/lib/date-utils";
import { cn, formatMoney } from "@/lib/utils";
import { ExcludedTable, InvoiceTotals, lineColumns } from "./invoice-parts";
import { InvoicePreview } from "./invoice-preview";
import type { InvoiceStatus } from "@/types/invoice";

const STEPS: InvoiceStatus[] = ["Draft", "Pending Approval", "Approved", "Exported"];

function Stepper({ status }: { status: InvoiceStatus }) {
  const idx = STEPS.indexOf(status);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
              i < idx && "border-success/30 bg-success/10 text-success",
              i === idx && "border-navy bg-navy text-white",
              i > idx && "border-border bg-muted/50 text-slate",
            )}
          >
            {i < idx ? <Check className="size-3.5" /> : <span className="text-[10px]">{i + 1}</span>}
            {s}
          </span>
          {i < STEPS.length - 1 && <span className="h-px w-5 bg-border" />}
        </li>
      ))}
    </ol>
  );
}

export function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { db, update } = useApp();
  const { can, canSeeFinancials } = useAuth();
  const router = useRouter();
  const [confirm, setConfirm] = useState<"submit" | "approve" | "delete" | null>(null);
  const [note, setNote] = useState("");

  const inv = db.invoices.find((i) => i.id === id);
  if (!canSeeFinancials) return null;
  if (!inv) {
    return (
      <div className="rounded-xl border bg-card">
        <EmptyState
          title="Invoice not found"
          description={`No invoice with id ${id} exists in the demo data.`}
          action={<Button variant="outline" render={<Link href="/invoicing" />} nativeButton={false}><ArrowLeft /> Back to invoicing</Button>}
        />
      </div>
    );
  }

  const { byRoute, bySize } = invoiceBreakdown(inv);
  const manage = can("invoice.manage");
  const m = (n: number) => formatMoney(n, inv.currency);

  const run = (fn: () => { ok: boolean; error?: string }, success: string) => {
    const res = fn();
    if (res.ok) toast.success(success);
    else toast.error(res.error ?? "Action failed");
    setNote("");
  };

  const exportCsv = () => {
    downloadCsv(`${inv.invoiceNo}`, invoiceCsvRows(inv));
    if (manage && (inv.status === "Approved" || inv.status === "Exported")) {
      run(() => update((d) => markInvoiceExported(d, inv.id)), `${inv.invoiceNo} CSV exported`);
    } else {
      toast.success("CSV downloaded", { description: "Draft export – status unchanged until the invoice is approved." });
    }
  };

  return (
    <div>
      <PageHeader
        title={inv.invoiceNo}
        description={`${inv.terminal} · ${formatMonth(inv.month)} · created ${formatDateTime(inv.createdAt)} by ${inv.createdBy}`}
        badge={<StatusBadge status={inv.status} />}
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            <Button variant="outline" render={<Link href="/invoicing" />} nativeButton={false}><ArrowLeft /> All invoices</Button>
            <Button variant="outline" onClick={exportCsv}><Download /> Export CSV</Button>
            <Button variant="outline" onClick={() => window.print()}><FileDown /> Save as PDF</Button>
            <Button variant="outline" onClick={() => window.print()}><Printer /> Print</Button>
            {manage && inv.status === "Draft" && (
              <>
                <Button variant="destructive" onClick={() => setConfirm("delete")}><Trash2 /> Delete</Button>
                <Button onClick={() => setConfirm("submit")}><Send /> Submit for approval</Button>
              </>
            )}
            {can("invoice.approve") && inv.status === "Pending Approval" && (
              <Button onClick={() => setConfirm("approve")}><CheckCircle2 /> Approve</Button>
            )}
          </div>
        }
      />

      <div className="no-print space-y-4">
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <Stepper status={inv.status} />
          <p className="mt-3 text-xs text-slate">
            {inv.status === "Draft" && "This invoice is a draft. It stays a draft until it is submitted and the Manager approves it."}
            {inv.status === "Pending Approval" && "Awaiting approval by an authorised manager. Approval is simulated and audit logged."}
            {inv.status === "Approved" && "Approved. Export the CSV for manual hand-off – there is no ERP posting in this demo."}
            {inv.status === "Exported" && "Exported as CSV for manual hand-off. There is no ERP posting in this demo."}
          </p>
        </div>

        <InvoiceTotals base={inv.baseAmount} diesel={inv.dieselAmount} final={inv.finalAmount} currency={inv.currency} movements={inv.lines.length} excluded={inv.excluded.length} />

        <SectionCard title="Invoice details">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <KeyValue label="Invoice No">{inv.invoiceNo}</KeyValue>
            <KeyValue label="Billing period">{formatMonth(inv.month)}</KeyValue>
            <KeyValue label="Terminal">{db.terminals.find((t) => t.code === inv.terminal)?.name ?? inv.terminal} ({inv.terminal})</KeyValue>
            <KeyValue label="Total movements">{inv.lines.length} journeys · {inv.lines.reduce((s, l) => s + l.containerNos.length, 0)} containers · {inv.lines.reduce((s, l) => s + l.units, 0)} billable units</KeyValue>
            <KeyValue label="Filters">{inv.routeFilter ? inv.routeFilter.replace("-", " → ") : "All routes"} · {inv.sizeFilter ?? "All sizes"}</KeyValue>
            <KeyValue label="Billing unit mode">{inv.unitMode === "per-trailer" ? "Per trailer (demo assumption)" : "Per container (demo assumption)"}</KeyValue>
            <KeyValue label="Diesel adjustment">{inv.dieselOverridePct !== null ? `Override ${inv.dieselOverridePct}%` : "Per rate card"} = {m(inv.dieselAmount)}</KeyValue>
            <KeyValue label="Final amount">{m(inv.finalAmount)}</KeyValue>
          </dl>
        </SectionCard>

        <div className="grid gap-4 lg:grid-cols-2">
          <SectionCard title="Container breakdown" bodyClassName="p-0">
            <DataTable
              columns={[
                { key: "size", header: "Size", cell: (r) => r.size },
                { key: "mv", header: "Journeys", align: "right", cell: (r) => r.movements },
                { key: "c", header: "Containers", align: "right", cell: (r) => r.containers },
                { key: "u", header: "Units", align: "right", cell: (r) => r.units },
                { key: "b", header: "Base", align: "right", cell: (r) => m(r.base) },
              ]}
              rows={bySize}
              getRowId={(r) => r.size}
              hidePagerIfSinglePage
              pageSize={5}
            />
          </SectionCard>
          <SectionCard title="Route breakdown" bodyClassName="p-0">
            <DataTable
              columns={[
                { key: "route", header: "Route", cell: (r) => r.route.replace("-", " → ") },
                { key: "mv", header: "Journeys", align: "right", cell: (r) => r.movements },
                { key: "u", header: "Units", align: "right", cell: (r) => r.units },
                { key: "b", header: "Base", align: "right", cell: (r) => m(r.base) },
                { key: "d", header: "Diesel", align: "right", cell: (r) => m(r.diesel) },
              ]}
              rows={byRoute}
              getRowId={(r) => r.route}
              hidePagerIfSinglePage
              pageSize={5}
            />
          </SectionCard>
        </div>

        <SectionCard title={`Line items (${inv.lines.length})`} bodyClassName="p-0">
          <DataTable columns={lineColumns(inv.currency)} rows={inv.lines} getRowId={(l) => l.movementId} pageSize={5} initialSort={{ key: "mv", dir: "asc" }} />
        </SectionCard>

        {inv.excluded.length > 0 && (
          <SectionCard title={`Excluded at creation (${inv.excluded.length})`} description="Not included in this invoice. Resolve and create a new draft if needed." bodyClassName="p-0">
            <ExcludedTable excluded={inv.excluded} />
          </SectionCard>
        )}

        <SectionCard title="History" description="Workflow events (also recorded in the audit log).">
          <ol className="space-y-3">
            {[...inv.history].reverse().map((h, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <div className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" />
                <div>
                  <div className="font-medium text-ink">{h.action}</div>
                  <div className="text-xs text-slate">{formatDateTime(h.at)} · {h.by}</div>
                  {h.note && <div className="mt-0.5 text-slate">{h.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        </SectionCard>

        <div>
          <h2 className="mb-2 text-sm font-semibold text-navy">Invoice preview</h2>
        </div>
      </div>

      <InvoicePreview invoice={inv} />

      <ConfirmDialog
        open={confirm === "submit"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Submit for approval?"
        description="The invoice moves to Pending Approval and can no longer be deleted."
        confirmLabel="Submit"
        onConfirm={() => run(() => update((d) => submitInvoice(d, inv.id, note)), "Submitted for approval")}
      >
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note" />
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "approve"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Approve this invoice?"
        description={`Approving ${inv.invoiceNo} (${m(inv.finalAmount)}) is simulated, audit logged as a financial event, and does not post to any ERP.`}
        confirmLabel="Approve"
        onConfirm={() => run(() => update((d) => approveInvoice(d, inv.id, note)), "Invoice approved")}
      >
        <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional approval note" />
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Delete this draft?"
        description="The draft is removed and its movements become billable again."
        confirmLabel="Delete draft"
        destructive
        onConfirm={() => {
          const res = update((d) => deleteInvoiceDraft(d, inv.id));
          if (res.ok) {
            toast.success("Draft deleted");
            router.push("/invoicing");
          } else toast.error(res.error);
        }}
      />
    </div>
  );
}
