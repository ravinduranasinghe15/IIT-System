"use client";

import Link from "next/link";
import { useMemo } from "react";
import { FileImage, FileText, ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { NativeSelect } from "@/components/shared/native-select";
import { SearchInput } from "@/components/shared/search-input";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import { formatDateTime } from "@/lib/date-utils";
import { DOC_TYPES, type EvidenceDoc } from "@/types/evidence";
import { movementsCovered } from "@/lib/driver-logs";
import { ocrState } from "./document-detail";
import { LogCoverage } from "./log-coverage";

export interface DocFilters {
  q: string;
  type: string;
  link: string;
  extraction: string;
  uploader: string;
}
export const EMPTY_FILTERS: DocFilters = { q: "", type: "", link: "", extraction: "", uploader: "" };

export function DocumentList({
  docs,
  onOpen,
  filters,
  onFilters,
  fixedMovementId,
}: {
  docs: EvidenceDoc[];
  onOpen: (doc: EvidenceDoc) => void;
  filters: DocFilters;
  onFilters: (f: DocFilters) => void;
  fixedMovementId?: string;
}) {
  const { db } = useApp();
  const uploaders = useMemo(() => Array.from(new Set(db.documents.map((d) => d.uploadedBy))).sort(), [db.documents]);

  const rows = useMemo(() => {
    const s = filters.q.trim().toLowerCase();
    return docs.filter((d) => {
      if (filters.type && d.docType !== filters.type) return false;
      const linked = !!d.movementId || movementsCovered(db, d).length > 0;
      if (filters.link === "linked" && !linked) return false;
      if (filters.link === "unlinked" && linked) return false;
      if (filters.extraction && ocrState(d) !== filters.extraction) return false;
      if (filters.uploader && d.uploadedBy !== filters.uploader) return false;
      if (!s) return true;
      return d.id.toLowerCase().includes(s) || d.name.toLowerCase().includes(s) || (d.movementId ?? "").toLowerCase().includes(s) || d.uploadedBy.toLowerCase().includes(s);
    });
  }, [docs, filters]);

  const columns: Column<EvidenceDoc>[] = [
    { key: "id", header: "Doc ID", sortValue: (d) => d.id, cell: (d) => <span className="font-semibold text-brand">{d.id}</span> },
    {
      key: "name",
      header: "File",
      sortValue: (d) => d.name,
      cell: (d) => (
        <div className="flex items-center gap-1.5">
          {d.mime === "application/pdf" ? <FileText className="size-4 shrink-0 text-danger" /> : <FileImage className="size-4 shrink-0 text-brand" />}
          <span className="max-w-56 truncate" title={d.name}>{d.name}</span>
        </div>
      ),
    },
    { key: "type", header: "Type", sortValue: (d) => d.docType, cell: (d) => <span className="whitespace-nowrap">{d.docType}</span> },
    { key: "at", header: "Uploaded", sortValue: (d) => d.uploadedAt, cell: (d) => <span className="whitespace-nowrap">{formatDateTime(d.uploadedAt)}</span> },
    { key: "by", header: "Uploaded by", sortValue: (d) => d.uploadedBy, cell: (d) => <span className="whitespace-nowrap">{d.uploadedBy}</span> },
    {
      key: "mv",
      header: "Linked movement",
      sortValue: (d) => d.movementId ?? "~",
      cell: (d) =>
        d.movementId ? (
          <Link href={`/movements/${d.movementId}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand hover:underline">{d.movementId}</Link>
        ) : d.docType === "Driver Log Sheet" && d.driverLog ? (
          <LogCoverage doc={d} />
        ) : (
          <span className="text-amber-600">Unlinked</span>
        ),
    },
    { key: "ocr", header: "Extraction", sortValue: (d) => ocrState(d), cell: (d) => <StatusBadge status={ocrState(d)} /> },
    { key: "size", header: "Size", align: "right", sortValue: (d) => d.sizeKb, cell: (d) => <span className="whitespace-nowrap text-xs text-slate">{d.sizeKb} KB</span> },
    {
      key: "act",
      header: "",
      align: "right",
      cell: (d) => (
        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onOpen(d); }}>
          <ScanText /> Open
        </Button>
      ),
    },
  ];

  const filtered = !!(filters.q || filters.type || filters.link || filters.extraction || filters.uploader);
  const set = (patch: Partial<DocFilters>) => onFilters({ ...filters, ...patch });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">
        <SearchInput value={filters.q} onChange={(q) => set({ q })} placeholder="Search doc ID, file, movement…" className="w-64 max-w-full" />
        <NativeSelect className="w-40" value={filters.type} onValueChange={(type) => set({ type })} placeholder="All types" options={DOC_TYPES} aria-label="Document type" />
        {!fixedMovementId && (
          <NativeSelect
            className="w-36"
            value={filters.link}
            onValueChange={(link) => set({ link })}
            placeholder="Linked & unlinked"
            options={[{ value: "linked", label: "Linked" }, { value: "unlinked", label: "Unlinked" }]}
            aria-label="Link status"
          />
        )}
        <NativeSelect className="w-44" value={filters.extraction} onValueChange={(extraction) => set({ extraction })} placeholder="Any extraction state" options={["Verified", "Needs Verification", "Not extracted"]} aria-label="Extraction state" />
        <NativeSelect className="w-44" value={filters.uploader} onValueChange={(uploader) => set({ uploader })} placeholder="All uploaders" options={uploaders} aria-label="Uploaded by" />
        {filtered && <Button variant="ghost" size="sm" onClick={() => onFilters(EMPTY_FILTERS)}>Clear filters</Button>}
        <span className="ml-auto text-xs text-slate">{rows.length} of {docs.length} document(s)</span>
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        getRowId={(d) => d.id}
        onRowClick={onOpen}
        initialSort={{ key: "at", dir: "desc" }}
        emptyTitle="No documents found"
        emptyDescription={docs.length ? "No document matches the current filters." : "Upload a chit or supporting document to get started."}
      />
    </div>
  );
}
