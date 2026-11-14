"use client";

import Link from "next/link";
import { CircleDollarSign, Fuel, Layers, ShieldAlert } from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { DataTable, type Column } from "@/components/shared/data-table";
import { formatDate } from "@/lib/date-utils";
import { formatMoney } from "@/lib/utils";
import { useApp } from "@/contexts/app-context";
import type { InvoiceLine } from "@/types/invoice";

export function InvoiceTotals({
  base,
  diesel,
  final,
  currency,
  movements,
  excluded,
}: {
  base: number;
  diesel: number;
  final: number;
  currency: string;
  movements: number;
  excluded: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatCard label="Movements" value={movements} icon={Layers} tone="blue" hint={`${excluded} excluded`} />
      <StatCard label="Base Amount" value={formatMoney(base, currency)} icon={CircleDollarSign} tone="navy" />
      <StatCard label="Diesel Adjustment" value={formatMoney(diesel, currency)} icon={Fuel} tone="orange" />
      <StatCard label="Final Amount" value={formatMoney(final, currency)} icon={ShieldAlert} tone="green" hint="Draft – not a tax invoice" />
    </div>
  );
}

export function lineColumns(currency: string): Column<InvoiceLine>[] {
  return [
    {
      key: "mv",
      header: "Movement",
      sortValue: (l) => l.movementId,
      cell: (l) => (
        <Link href={`/movements/${l.movementId}`} className="font-medium text-brand hover:underline">
          {l.movementId}
        </Link>
      ),
    },
    { key: "cn", header: "Container(s)", cell: (l) => <span className="whitespace-nowrap">{l.containerNos.join(" / ")}</span> },
    { key: "size", header: "Size", sortValue: (l) => l.containerSize, cell: (l) => l.containerSize },
    { key: "route", header: "Route", sortValue: (l) => l.route, cell: (l) => l.route.replace("-", " → ") },
    { key: "day", header: "Op. Day", sortValue: (l) => l.movementDate, cell: (l) => formatDate(l.movementDate) },
    { key: "units", header: "Units", align: "right", sortValue: (l) => l.units, cell: (l) => l.units },
    { key: "rate", header: "Rate", align: "right", sortValue: (l) => l.rate, cell: (l) => formatMoney(l.rate, currency) },
    { key: "base", header: "Base", align: "right", sortValue: (l) => l.baseAmount, cell: (l) => formatMoney(l.baseAmount, currency) },
    { key: "dpct", header: "Diesel %", align: "right", sortValue: (l) => l.dieselPct, cell: (l) => `${l.dieselPct}%` },
    { key: "damt", header: "Diesel", align: "right", sortValue: (l) => l.dieselAmount, cell: (l) => formatMoney(l.dieselAmount, currency) },
    {
      key: "total",
      header: "Line Total",
      align: "right",
      sortValue: (l) => l.baseAmount + l.dieselAmount,
      cell: (l) => <span className="font-semibold">{formatMoney(l.baseAmount + l.dieselAmount, currency)}</span>,
    },
  ];
}

export function ExcludedTable({ excluded }: { excluded: { movementId: string; reason: string }[] }) {
  const { db } = useApp();
  const columns: Column<{ movementId: string; reason: string }>[] = [
    {
      key: "mv",
      header: "Movement",
      sortValue: (e) => e.movementId,
      cell: (e) => (
        <Link href={`/movements/${e.movementId}`} className="font-medium text-brand hover:underline">
          {e.movementId}
        </Link>
      ),
    },
    {
      key: "cn",
      header: "Container(s)",
      cell: (e) => db.movements.find((m) => m.id === e.movementId)?.containerNos.join(" / ") ?? "—",
    },
    { key: "reason", header: "Reason excluded", sortValue: (e) => e.reason, cell: (e) => <span className="text-amber-700">{e.reason}</span> },
  ];
  return (
    <DataTable
      columns={columns}
      rows={excluded}
      getRowId={(e) => e.movementId}
      pageSize={5}
      hidePagerIfSinglePage
      emptyTitle="Nothing excluded"
      emptyDescription="Every movement for this selection is billable."
    />
  );
}
