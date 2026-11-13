"use client";

import Link from "next/link";
import { Eye, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { formatDateTime, formatMonth } from "@/lib/date-utils";
import { formatMoney } from "@/lib/utils";
import type { Invoice } from "@/types/invoice";

export function InvoiceTable({
  invoices,
  onDelete,
  pageSize = 10,
}: {
  invoices: Invoice[];
  onDelete?: (inv: Invoice) => void;
  pageSize?: number;
}) {
  const columns: Column<Invoice>[] = [
    {
      key: "no",
      header: "Invoice No",
      sortValue: (i) => i.invoiceNo,
      cell: (i) => (
        <Link href={`/invoicing/${i.id}`} className="font-medium text-brand hover:underline">
          {i.invoiceNo}
        </Link>
      ),
    },
    { key: "terminal", header: "Terminal", sortValue: (i) => i.terminal, cell: (i) => i.terminal },
    { key: "month", header: "Billing Period", sortValue: (i) => i.month, cell: (i) => formatMonth(i.month) },
    { key: "mv", header: "Movements", align: "right", sortValue: (i) => i.lines.length, cell: (i) => i.lines.length },
    { key: "base", header: "Base Amount", align: "right", sortValue: (i) => i.baseAmount, cell: (i) => formatMoney(i.baseAmount, i.currency) },
    { key: "diesel", header: "Diesel Adj.", align: "right", sortValue: (i) => i.dieselAmount, cell: (i) => formatMoney(i.dieselAmount, i.currency) },
    { key: "final", header: "Final Amount", align: "right", sortValue: (i) => i.finalAmount, cell: (i) => <span className="font-semibold">{formatMoney(i.finalAmount, i.currency)}</span> },
    { key: "status", header: "Status", sortValue: (i) => i.status, cell: (i) => <StatusBadge status={i.status} /> },
    { key: "created", header: "Created", sortValue: (i) => i.createdAt, cell: (i) => <span className="text-slate">{formatDateTime(i.createdAt)}</span> },
    {
      key: "actions",
      header: "Actions",
      align: "right",
      cell: (i) => (
        <div className="flex justify-end gap-1">
          <Button size="xs" variant="outline" render={<Link href={`/invoicing/${i.id}`} />} nativeButton={false}>
            <Eye /> View
          </Button>
          {onDelete && i.status === "Draft" && (
            <Button size="icon-xs" variant="destructive" aria-label={`Delete ${i.invoiceNo}`} onClick={() => onDelete(i)}>
              <Trash2 />
            </Button>
          )}
        </div>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={invoices}
      getRowId={(i) => i.id}
      pageSize={pageSize}
      initialSort={{ key: "created", dir: "desc" }}
      emptyTitle="No invoices match"
      emptyDescription="Adjust the filters or create a new invoice draft."
    />
  );
}
