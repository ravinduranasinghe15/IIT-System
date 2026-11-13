"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2 } from "lucide-react";
import { FormDialog } from "@/components/shared/form-dialog";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { NativeSelect } from "@/components/shared/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useApp } from "@/contexts/app-context";
import { useFleetActions } from "@/hooks/use-fleet";
import { parseSpreadsheet, type ParsedSheet } from "@/lib/excel-parser";
import { GPS_FIELDS, suggestGpsMapping, validateGpsRows, type GpsMapping, type GpsRowResult, type GpsRowStatus } from "@/lib/gps-import";
import { formatDate } from "@/lib/date-utils";
import { cn, formatNumber } from "@/lib/utils";

const STATUS_STYLE: Record<GpsRowStatus, string> = {
  Valid: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Overlap: "bg-amber-50 text-amber-700 ring-amber-600/20",
  "Duplicate in file": "bg-amber-50 text-amber-700 ring-amber-600/20",
  Invalid: "bg-red-50 text-red-700 ring-red-600/20",
};

/** Track My Car file import: parse (SheetJS) → map columns → preview & validate → confirm. */
export function GpsImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { db } = useApp();
  const actions = useFleetActions();
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<GpsMapping>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [includeOverlap, setIncludeOverlap] = useState(false);

  const results = useMemo<GpsRowResult[]>(() => (sheet ? validateGpsRows(db, sheet, mapping) : []), [db, sheet, mapping]);
  const counts = useMemo(() => {
    const c: Record<GpsRowStatus, number> = { Valid: 0, Overlap: 0, "Duplicate in file": 0, Invalid: 0 };
    results.forEach((r) => (c[r.status] += 1));
    return c;
  }, [results]);
  const importable = results.filter((r) => r.status === "Valid" || (includeOverlap && r.status === "Overlap"));
  const missingRequired = GPS_FIELDS.filter((f) => f.required && !mapping[f.key]);
  const sameFile = sheet && db.gpsImports.find((g) => g.fileName === sheet.fileName);

  const onFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const parsed = await parseSpreadsheet(file);
      setSheet(parsed);
      setMapping(suggestGpsMapping(parsed.headers));
      setIncludeOverlap(false);
    } catch (e) {
      setSheet(null);
      setError(e instanceof Error ? e.message : "Could not read the file.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setSheet(null);
    setMapping({});
    setError("");
  };

  const confirm = () => {
    if (!sheet) return;
    if (actions.importGps({ fileName: sheet.fileName, rows: importable })) onOpenChange(false);
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Import Track My Car file"
      description="CSV / XLSX GPS export. Records are added as GPS fuel records – existing fuel records are never changed."
      size="xl"
      footer={
        <>
          {sheet && (
            <Button variant="ghost" className="mr-auto" onClick={reset}>
              Choose another file
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!sheet || missingRequired.length > 0 || importable.length === 0} onClick={confirm}>
            Import {importable.length ? `${importable.length} record${importable.length === 1 ? "" : "s"}` : ""}
          </Button>
        </>
      }
    >
      {!sheet ? (
        <div className="space-y-3">
          <FileDropzone accept=".csv,.xlsx,.xls" onFiles={onFile} title="Drag & drop the Track My Car export" hint="CSV, XLSX or XLS" />
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate">
              <Loader2 className="size-4 animate-spin" /> Reading file…
            </div>
          )}
          {error && <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-slate">No file handy? Use the sample export (PM-001 to PM-009, 1–12 Nov 2026).</span>
            <Button variant="outline" size="sm" render={<a href="/documents/sample-trackmycar.csv" download />}>
              <Download /> Sample file
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <FileSpreadsheet className="size-4 text-brand" />
            <span className="font-medium">{sheet.fileName}</span>
            <span className="text-slate">
              · {sheet.rows.length} rows · sheet “{sheet.sheetName}” · {sheet.fileSizeKb} KB
            </span>
          </div>
          {sameFile && (
            <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> A file named “{sheet.fileName}” was already imported as {sameFile.id} on {formatDate(sameFile.uploadedAt)}. Rows that fall in already-imported periods are flagged below.
            </p>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy">1. Map columns</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {GPS_FIELDS.map((f) => (
                <div key={f.key}>
                  <div className="mb-1 text-xs font-medium text-slate">
                    {f.label}
                    {f.required && <span className="ml-0.5 text-danger">*</span>}
                  </div>
                  <NativeSelect
                    value={mapping[f.key] ?? ""}
                    onValueChange={(v) => setMapping((m) => ({ ...m, [f.key]: v || undefined }))}
                    placeholder="— not mapped —"
                    options={sheet.headers}
                    aria-label={`Column for ${f.label}`}
                  />
                </div>
              ))}
            </div>
            {missingRequired.length > 0 && <p className="mt-2 text-xs text-danger">Map the required column(s): {missingRequired.map((f) => f.label).join(", ")}.</p>}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy">2. Validation</h3>
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                <CheckCircle2 className="size-3" /> {counts.Valid} valid
              </span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">{counts.Overlap} overlap existing import</span>
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">{counts["Duplicate in file"]} duplicate in file</span>
              <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 ring-1 ring-inset ring-red-600/20">{counts.Invalid} invalid</span>
            </div>
            {counts.Overlap > 0 && (
              <label className="mt-2 flex cursor-pointer items-start gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-slate">
                <input type="checkbox" className="mt-0.5" checked={includeOverlap} onChange={(e) => setIncludeOverlap(e.target.checked)} />
                <span>
                  <span className="font-medium text-ink">Also import the {counts.Overlap} overlapping row(s).</span> They fall in periods already covered by an earlier GPS import for the same vehicle; importing them adds to (does not replace) the existing GPS litres and may double-count.
                </span>
              </label>
            )}
            {counts.Invalid + counts["Duplicate in file"] > 0 && <p className="mt-2 text-xs text-slate">Invalid and duplicate rows are skipped and listed below with the reason.</p>}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-navy">3. Preview</h3>
            <div className="scroll-thin max-h-72 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60">
                    <TableHead className="text-xs">Row</TableHead>
                    <TableHead className="text-xs">Vehicle</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-right text-xs">Fuel (L)</TableHead>
                    <TableHead className="text-right text-xs">Distance (km)</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results
                    .slice()
                    .sort((a, b) => (a.status === "Valid" ? 1 : 0) - (b.status === "Valid" ? 1 : 0) || a.rowNo - b.rowNo)
                    .slice(0, 60)
                    .map((r) => (
                      <TableRow key={r.rowNo}>
                        <TableCell className="py-1.5 text-xs text-slate">{r.rowNo}</TableCell>
                        <TableCell className="py-1.5 text-xs">{r.vehicleId ?? (mapping.vehicle ? r.raw[mapping.vehicle] : "") ?? "—"}</TableCell>
                        <TableCell className="py-1.5 text-xs">{r.date ? formatDate(r.date) : (mapping.date ? r.raw[mapping.date] : "") || "—"}</TableCell>
                        <TableCell className="py-1.5 text-right text-xs tabular-nums">{r.litres !== null ? formatNumber(r.litres, 1) : "—"}</TableCell>
                        <TableCell className="py-1.5 text-right text-xs tabular-nums">{r.distanceKm !== null ? formatNumber(r.distanceKm) : "—"}</TableCell>
                        <TableCell className="py-1.5">
                          <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset", STATUS_STYLE[r.status])}>{r.status}</span>
                        </TableCell>
                        <TableCell className="max-w-72 py-1.5 text-xs text-slate">{r.problems.join("; ")}</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
            {results.length > 60 && <p className="mt-1 text-xs text-slate">Showing the first 60 rows (problem rows first). All {results.length} rows are validated.</p>}
          </div>
        </div>
      )}
    </FormDialog>
  );
}
