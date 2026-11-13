"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, RefreshCw, X } from "lucide-react";
import type { DB } from "@/types/db";
import type { ImportRecord } from "@/types/import";
import type { TerminalCode } from "@/types/terminal";
import type { ParsedSheet } from "@/lib/excel-parser";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { NativeSelect } from "@/components/shared/native-select";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { cn } from "@/lib/utils";
import { SAMPLE_FILES, SOURCE_TERMINALS, TerminalTag } from "./import-common";

export function TerminalPicker({ db, value, onChange }: { db: DB; value: TerminalCode; onChange: (t: TerminalCode) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {SOURCE_TERMINALS.map((code) => {
        const t = db.terminals.find((x) => x.code === code);
        const selected = value === code;
        const conditional = t?.status === "Conditional";
        const remembered = Object.keys(db.settings.importMappings[code] ?? {}).length > 0;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            aria-pressed={selected}
            className={cn(
              "rounded-xl border bg-card p-3.5 text-left transition hover:border-brand/50",
              selected && "border-brand ring-2 ring-brand/25",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <TerminalTag code={code} className="text-base" />
              {t && <StatusBadge status={t.status} />}
            </div>
            <div className="mt-1 text-xs font-medium text-ink">{t?.name}</div>
            <div className="mt-1 text-xs text-slate">{t?.note}</div>
            <div className="mt-2 text-[11px] text-slate">
              {conditional ? "Pilot import allowed – results labelled provisional." : remembered ? "Saved column mapping available." : "No saved mapping yet."}
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function FileUploadStep({
  db,
  terminal,
  onTerminalChange,
  parsed,
  parsing,
  error,
  duplicateOf,
  onFile,
  onClear,
  onSheet,
}: {
  db: DB;
  terminal: TerminalCode;
  onTerminalChange: (t: TerminalCode) => void;
  parsed: ParsedSheet | null;
  parsing: boolean;
  error: string | null;
  duplicateOf: ImportRecord | undefined;
  onFile: (f: File) => void;
  onClear: () => void;
  onSheet: (index: number) => void;
}) {
  return (
    <div className="space-y-4">
      <SectionCard title="1 · Select source terminal" description="Each terminal reports in its own layout. The column mapping you confirm is remembered per terminal.">
        <TerminalPicker db={db} value={terminal} onChange={onTerminalChange} />
        {terminal === "CICT" && (
          <Alert className="mt-3 border-amber-300 bg-amber-50/60">
            <AlertTriangle className="text-amber-600" />
            <AlertTitle className="text-amber-800">CICT – conditional source</AlertTitle>
            <AlertDescription className="text-amber-800/90">
              CICT is subject to receiving and validating a usable sample report format. You can run a trial (pilot) import; all results
              are labelled provisional and the CICT-JCT route is still marked conditional.
            </AlertDescription>
          </Alert>
        )}
      </SectionCard>

      <SectionCard
        title="2 · Upload terminal report"
        description="XLSX, XLS or CSV. The file is parsed in your browser with SheetJS – nothing is uploaded to a server."
        actions={
          <div className="hidden items-center gap-1 sm:flex">
            {SAMPLE_FILES.map((s) => (
              <Button key={s.href} variant="outline" size="sm" render={<a href={s.href} download />}>
                <Download /> {s.terminal} sample
              </Button>
            ))}
          </div>
        }
      >
        {!parsed && !parsing && (
          <FileDropzone
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onFiles={(f) => onFile(f[0])}
            title="Drag & drop the terminal report here"
            hint="XLSX · XLS · CSV"
          />
        )}
        {parsing && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate" role="status">
            <Loader2 className="size-4 animate-spin" /> Reading spreadsheet…
          </div>
        )}
        {error && (
          <Alert variant="destructive" className="mt-3">
            <AlertTriangle />
            <AlertTitle>Could not read this file</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {parsed && !parsing && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success">
                <FileSpreadsheet className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{parsed.fileName}</div>
                <div className="text-xs text-slate">
                  {parsed.fileSizeKb} KB · {parsed.rows.length} data row(s) · {parsed.headers.length} columns · sheet “{parsed.sheetName}”
                </div>
                <div className="truncate font-mono text-[11px] text-slate" title={parsed.fingerprint}>
                  Fingerprint {parsed.fingerprint.slice(0, 24)}…
                </div>
              </div>
              {parsed.sheetNames.length > 1 && (
                <NativeSelect
                  className="w-48"
                  value={parsed.sheetName}
                  onValueChange={(v) => onSheet(parsed.sheetNames.indexOf(v))}
                  options={parsed.sheetNames}
                  aria-label="Worksheet"
                />
              )}
              <Button variant="outline" size="sm" onClick={onClear}>
                <RefreshCw /> Replace file
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={onClear} aria-label="Remove file">
                <X />
              </Button>
            </div>
            {duplicateOf ? (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Duplicate file detected</AlertTitle>
                <AlertDescription>
                  This exact file was already imported as{" "}
                  <Link href={`/terminal-imports/${duplicateOf.id}`} className="font-semibold underline">{duplicateOf.id}</Link> ({duplicateOf.fileName}, {duplicateOf.terminal}).
                  Continuing will record a “Rejected – Duplicate File” entry in the import history; no movements will be created.
                </AlertDescription>
              </Alert>
            ) : (
              <div className="flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="size-3.5" /> New file – fingerprint not seen in the import history.
              </div>
            )}
          </div>
        )}
        <div className="mt-3 text-xs text-slate sm:hidden">
          Sample files:{" "}
          {SAMPLE_FILES.map((s) => (
            <a key={s.href} href={s.href} download className="mr-2 font-medium text-brand underline">{s.name}</a>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
