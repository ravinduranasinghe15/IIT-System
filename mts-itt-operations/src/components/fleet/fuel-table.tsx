"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Paperclip } from "lucide-react";
import { DataTable, type Column } from "@/components/shared/data-table";
import { SearchInput } from "@/components/shared/search-input";
import { NativeSelect } from "@/components/shared/native-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { downloadCsv } from "@/lib/export-utils";
import { formatDate } from "@/lib/date-utils";
import { formatMoney, formatNumber, cn } from "@/lib/utils";
import type { FuelRecord } from "@/types/fuel";

const SOURCE_STYLE: Record<string, string> = {
  GPS: "bg-sky-50 text-sky-700 ring-sky-600/20",
  "Fuel Invoice": "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Manual: "bg-violet-50 text-violet-700 ring-violet-600/20",
};

export function SourceBadge({ source }: { source: string }) {
  return <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", SOURCE_STYLE[source] ?? "bg-slate-100 text-slate-600 ring-slate-500/20")}>{source}</span>;
}

/** Original fuel records (GPS / invoice / manual). Read-only: records are never edited or deleted. */
export function FuelTable({ records, showVehicle = true, filters = true }: { records: FuelRecord[]; showVehicle?: boolean; filters?: boolean }) {
  const { db } = useApp();
  const { canSeeFinancials } = useAuth();
  const [q, setQ] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [source, setSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return records.filter((r) => {
      if (vehicle && r.vehicleId !== vehicle) return false;
      if (source && r.source !== source) return false;
      if (from && r.date < from) return false;
      if (to && r.date > to) return false;
      if (!s) return true;
      return [r.id, r.vehicleId, r.station ?? "", r.invoiceNo ?? "", r.enteredBy, r.gpsImportId ?? ""].some((v) => v.toLowerCase().includes(s));
    });
  }, [records, q, vehicle, source, from, to]);

  const columns: Column<FuelRecord>[] = [
    { key: "id", header: "Record", sortValue: (r) => r.id, cell: (r) => <span className="font-medium text-navy">{r.id}</span> },
    { key: "date", header: "Date", sortValue: (r) => r.date, cell: (r) => <span className="whitespace-nowrap">{formatDate(r.date)}</span> },
    ...(showVehicle ? [{ key: "veh", header: "Vehicle", sortValue: (r: FuelRecord) => r.vehicleId, cell: (r: FuelRecord) => <Link href={`/fleet/${r.vehicleId}`} className="text-brand hover:underline">{r.vehicleId}</Link> }] : []),
    { key: "src", header: "Source", sortValue: (r) => r.source, cell: (r) => <SourceBadge source={r.source} /> },
    { key: "l", header: "Litres", align: "right", sortValue: (r) => r.litres, cell: (r) => <span className="tabular-nums">{formatNumber(r.litres, 1)}</span> },
    { key: "km", header: "Distance (km)", align: "right", sortValue: (r) => r.distanceKm ?? -1, cell: (r) => (r.distanceKm !== undefined ? formatNumber(r.distanceKm) : "—") },
    { key: "cons", header: "L/100km", align: "right", cell: (r) => (r.distanceKm ? formatNumber((r.litres / r.distanceKm) * 100, 1) : "—") },
    ...(canSeeFinancials ? [{ key: "amt", header: "Amount", align: "right" as const, sortValue: (r: FuelRecord) => r.amount ?? -1, cell: (r: FuelRecord) => (r.amount !== undefined ? formatMoney(r.amount, db.settings.currency) : "—") }] : []),
    { key: "station", header: "Station / Invoice", cell: (r) => (r.station || r.invoiceNo ? <div><div>{r.station ?? "—"}</div><div className="text-xs text-slate">{r.invoiceNo}</div></div> : <span className="text-slate">—</span>) },
    {
      key: "doc",
      header: "Attachment",
      cell: (r) =>
        r.documentId ? (
          <Link href={`/evidence?doc=${r.documentId}`} className="inline-flex items-center gap-1 text-brand hover:underline">
            <Paperclip className="size-3" />
            {r.documentId}
          </Link>
        ) : (
          <span className="text-slate">—</span>
        ),
    },
    { key: "ref", header: "Import / Entered by", cell: (r) => <div className="text-xs"><div>{r.gpsImportId ?? "—"}</div><div className="text-slate">{r.enteredBy}</div></div> },
  ];

  return (
    <div>
      {filters && (
        <div className="flex flex-wrap items-center gap-2 border-b p-3">
          <SearchInput value={q} onChange={setQ} placeholder="Search record, station, invoice…" className="w-full sm:w-64" />
          {showVehicle && <NativeSelect className="w-36" value={vehicle} onValueChange={setVehicle} placeholder="All vehicles" options={db.primeMovers.map((p) => p.id)} aria-label="Vehicle filter" />}
          <NativeSelect className="w-36" value={source} onValueChange={setSource} placeholder="All sources" options={["GPS", "Fuel Invoice", "Manual"]} aria-label="Source filter" />
          <Input type="date" className="h-8 w-36" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          <Input type="date" className="h-8 w-36" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          {(q || vehicle || source || from || to) && (
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); setVehicle(""); setSource(""); setFrom(""); setTo(""); }}>
              Clear
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={!rows.length}
            onClick={() =>
              downloadCsv(
                "fuel-records",
                rows.map((r) => ({ Record: r.id, Date: r.date, Vehicle: r.vehicleId, Source: r.source, Litres: r.litres, "Distance km": r.distanceKm, Amount: canSeeFinancials ? r.amount : undefined, Station: r.station, "Invoice No": r.invoiceNo, Document: r.documentId, "GPS Import": r.gpsImportId, "Entered by": r.enteredBy })),
              )
            }
          >
            <Download /> Export CSV
          </Button>
        </div>
      )}
      <DataTable columns={columns} rows={rows} getRowId={(r) => r.id} initialSort={{ key: "date", dir: "desc" }} pageSize={10} emptyTitle="No fuel records" emptyDescription="Add a fuel entry or import a Track My Car file." />
    </div>
  );
}
