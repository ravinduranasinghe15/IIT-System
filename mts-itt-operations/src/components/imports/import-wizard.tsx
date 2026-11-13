"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CheckCircle2, FileX2, Lock, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useImportActions } from "@/hooks/use-imports";
import { parseSpreadsheet, suggestMapping, type ParsedSheet } from "@/lib/excel-parser";
import { importableRows, missingRequiredFields, processRows, summarize } from "@/lib/import-processor";
import { findImportByFingerprint, type CommitImportResult } from "@/lib/mutations/import";
import type { ColumnMapping } from "@/types/import";
import type { TerminalCode } from "@/types/terminal";
import { cn } from "@/lib/utils";
import { ColumnMappingEditor } from "./column-mapping";
import { FileUploadStep } from "./file-upload";
import { TerminalTag } from "./import-common";
import { ImportPreview } from "./import-preview";
import { RowResultsTable, ValidationSummary } from "./validation-results";

const STEPS = ["Source & file", "Preview & mapping", "Validate & review", "Results"];

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 shadow-sm">
      {STEPS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                done ? "bg-success text-white" : active ? "bg-navy text-white" : "bg-muted text-slate",
              )}
            >
              {done ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("text-sm", active ? "font-semibold text-navy" : done ? "text-ink" : "text-slate")}>{label}</span>
            {i < STEPS.length - 1 && <span className="mx-1 hidden h-px w-8 bg-border sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}

const ACCEPTED = /\.(xlsx|xls|csv)$/i;

export function ImportWizard() {
  const { db } = useApp();
  const { can } = useAuth();
  const { commit } = useImportActions();

  const [step, setStep] = useState(0);
  const [terminal, setTerminal] = useState<TerminalCode>("CWIT");
  const [file, setFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedSheet | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [included, setIncluded] = useState<ReadonlySet<number>>(new Set());
  const [result, setResult] = useState<CommitImportResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const remembered = db.settings.importMappings[terminal];
  const duplicateFile = parsed ? findImportByFingerprint(db, parsed.fingerprint) : undefined;

  const load = useCallback(
    async (f: File, sheetIndex = 0, forTerminal: TerminalCode = terminal) => {
      setParseError(null);
      if (!ACCEPTED.test(f.name)) {
        setParseError("Unsupported file type. Please upload an .xlsx, .xls or .csv file.");
        toast.error("Unsupported file type");
        return;
      }
      setParsing(true);
      try {
        const p = await parseSpreadsheet(f, sheetIndex);
        if (!p.rows.length) throw new Error("The worksheet has a header row but no data rows.");
        setFile(f);
        setParsed(p);
        setMapping(suggestMapping(p.headers, db.settings.importMappings[forTerminal]));
        setIncluded(new Set());
        toast.success(`Read ${p.rows.length} rows from ${p.fileName}`);
      } catch (e) {
        setParsed(null);
        setFile(null);
        const msg = e instanceof Error ? e.message : "Unknown error";
        setParseError(msg);
        toast.error("Could not read the file", { description: msg });
      } finally {
        setParsing(false);
      }
    },
    [db.settings.importMappings, terminal],
  );

  const clearFile = () => {
    setFile(null);
    setParsed(null);
    setParseError(null);
    setMapping({});
    setIncluded(new Set());
  };

  const changeTerminal = (t: TerminalCode) => {
    setTerminal(t);
    if (parsed) setMapping(suggestMapping(parsed.headers, db.settings.importMappings[t]));
  };

  const processed = useMemo(
    () => (parsed && step === 2 ? processRows({ db, terminal, mapping, rows: parsed.rows, display: parsed.display }) : []),
    [parsed, step, db, terminal, mapping],
  );
  const summary = useMemo(() => summarize(processed, included), [processed, included]);
  const toImport = useMemo(() => importableRows(processed, included), [processed, included]);
  const missingMap = missingRequiredFields(mapping);

  if (!can("import.run")) {
    return (
      <>
        <PageHeader title="New terminal import" description="Upload, map, validate and import a terminal report." />
        <div className="rounded-xl border bg-card py-6 shadow-sm">
          <EmptyState
            icon={Lock}
            title="You do not have permission to run imports"
            description="Importing terminal reports requires the Administrator, Operations Manager or Operations Staff role. Use the role switcher in the header."
            action={<Button variant="outline" render={<Link href="/terminal-imports" />}>Back to import history</Button>}
          />
        </div>
      </>
    );
  }

  const runCommit = () => {
    if (!parsed) return;
    const res = commit({
      fileName: parsed.fileName,
      fingerprint: parsed.fingerprint,
      terminal,
      mapping,
      rows: processed,
      includeDuplicateRows: Array.from(included),
    });
    setResult(res);
    setStep(3);
    if (res.rejectedDuplicateFile) toast.warning("Duplicate file rejected", { description: "Recorded in the import history; no movements were created." });
    else toast.success(`Import ${res.record.id} completed`, { description: `${res.record.success} movement(s) created, ${res.record.exceptionsRaised} exception(s) raised.` });
  };

  const reset = () => {
    clearFile();
    setResult(null);
    setStep(0);
  };

  return (
    <>
      <PageHeader
        title="New terminal import"
        description="Upload a terminal report, map its columns, validate every row and confirm. Invalid and duplicate rows are never discarded – they stay in the import record with reasons."
        badge={terminal === "CICT" ? <StatusBadge status="Conditional" /> : undefined}
        actions={
          <Button variant="outline" render={<Link href="/terminal-imports" />}>
            <ArrowLeft /> Import history
          </Button>
        }
      />
      <Stepper step={step} />

      {step === 0 && (
        <>
          <FileUploadStep
            db={db}
            terminal={terminal}
            onTerminalChange={changeTerminal}
            parsed={parsed}
            parsing={parsing}
            error={parseError}
            duplicateOf={duplicateFile}
            onFile={(f) => load(f)}
            onClear={clearFile}
            onSheet={(i) => file && load(file, i)}
          />
          <WizardNav>
            <span />
            <Button disabled={!parsed || parsing} onClick={() => setStep(1)}>
              Continue to mapping <ArrowRight />
            </Button>
          </WizardNav>
        </>
      )}

      {step === 1 && parsed && (
        <div className="space-y-4">
          <ColumnMappingEditor
            parsed={parsed}
            mapping={mapping}
            onChange={setMapping}
            terminal={terminal}
            remembered={remembered}
            onReset={() => {
              setMapping(suggestMapping(parsed.headers));
              toast.info("Mapping auto-detected from the file's headers");
            }}
            onUseRemembered={() => {
              setMapping(suggestMapping(parsed.headers, remembered));
              toast.info(`Applied saved ${terminal} mapping`);
            }}
          />
          <ImportPreview parsed={parsed} mapping={mapping} />
          <WizardNav>
            <Button variant="outline" onClick={() => setStep(0)}>
              <ArrowLeft /> Back
            </Button>
            <Button disabled={missingMap.length > 0} onClick={() => setStep(2)}>
              Validate rows <ArrowRight />
            </Button>
          </WizardNav>
        </div>
      )}

      {step === 2 && parsed && (
        <div className="space-y-4">
          {terminal === "CICT" && (
            <Alert className="border-amber-300 bg-amber-50/60">
              <AlertTriangle className="text-amber-600" />
              <AlertTitle className="text-amber-800">CICT pilot import</AlertTitle>
              <AlertDescription className="text-amber-800/90">
                CICT’s report format is pending sample validation. These results are provisional and the import will be labelled as a pilot.
              </AlertDescription>
            </Alert>
          )}
          {duplicateFile && (
            <Alert variant="destructive">
              <FileX2 />
              <AlertTitle>This file will be rejected as a duplicate</AlertTitle>
              <AlertDescription>
                Identical to{" "}
                <Link href={`/terminal-imports/${duplicateFile.id}`} className="font-semibold underline">{duplicateFile.id}</Link>. Confirming records a
                “Rejected – Duplicate File” entry in the history and creates no movements, so nothing is counted twice.
              </AlertDescription>
            </Alert>
          )}
          <ValidationSummary summary={summary} included={included.size} />
          <SectionCard
            title="Row-level validation"
            description="Warnings import the row and raise exceptions during reconciliation. Invalid rows are rejected. Potential duplicates (same container + source terminal + operational day) are held unless you tick “Import anyway”."
            bodyClassName="p-0"
          >
            <RowResultsTable
              rows={processed.map((p) => p.result)}
              included={included}
              canInclude={!duplicateFile}
              onToggleInclude={(rowNo, on) =>
                setIncluded((prev) => {
                  const next = new Set(prev);
                  if (on) next.add(rowNo);
                  else next.delete(rowNo);
                  return next;
                })
              }
              fileLabel={parsed.fileName.replace(/\.[^.]+$/, "")}
            />
          </SectionCard>
          <WizardNav>
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft /> Back to mapping
            </Button>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate sm:block">
                {duplicateFile ? "No movements will be created." : `${toImport.length} of ${processed.length} row(s) will become movements.`}
              </span>
              <Button
                variant={duplicateFile ? "destructive" : "default"}
                disabled={!duplicateFile && toImport.length === 0}
                onClick={() => setConfirmOpen(true)}
              >
                <PlayCircle /> {duplicateFile ? "Record rejected duplicate" : `Confirm import (${toImport.length})`}
              </Button>
            </div>
          </WizardNav>
          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title={duplicateFile ? "Record duplicate file as rejected?" : `Import ${toImport.length} row(s) from ${parsed.fileName}?`}
            confirmLabel={duplicateFile ? "Record rejection" : "Import now"}
            destructive={!!duplicateFile}
            onConfirm={runCommit}
            description={
              duplicateFile ? (
                `The file matches ${duplicateFile.id}. It will be kept in the import history as a rejected duplicate and no movements will be created.`
              ) : (
                <>
                  {toImport.length} movement(s) will be created with origin “Import” and reconciled. {summary.invalid} invalid and{" "}
                  {summary.duplicates} duplicate row(s) stay in the import record for review. {terminal === "CICT" && "This is a CICT pilot import."}
                </>
              )
            }
          />
        </div>
      )}

      {step === 3 && result && (
        <div className="space-y-4">
          {result.rejectedDuplicateFile ? (
            <Alert variant="destructive">
              <FileX2 />
              <AlertTitle>Rejected – Duplicate File ({result.record.id})</AlertTitle>
              <AlertDescription>{result.record.note}</AlertDescription>
            </Alert>
          ) : (
            <Alert className="border-emerald-300 bg-emerald-50/60">
              <CheckCircle2 className="text-success" />
              <AlertTitle className="text-emerald-800">
                Import {result.record.id} {result.record.status === "Completed" ? "completed" : "completed with issues"}
                {terminal === "CICT" ? " (pilot)" : ""}
              </AlertTitle>
              <AlertDescription className="text-emerald-800/90">
                {result.record.fileName} · <TerminalTag code={result.record.terminal} className="text-xs" /> · the import history, movement ledger and dashboard now reflect these rows.
                {terminal === "CICT" ? " Results are provisional pending CICT format validation." : ""}
              </AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Total rows" value={result.record.total} tone="navy" />
            <StatCard label="Movements created" value={result.record.success} tone="green" />
            <StatCard label="Invalid" value={result.record.failed} tone="red" />
            <StatCard label="Duplicates held" value={result.record.duplicate} tone="orange" />
            <StatCard label="Exceptions raised" value={result.record.exceptionsRaised} tone="orange" hint="Billing blocked until resolved" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button render={<Link href={`/terminal-imports/${result.record.id}`} />}>View row-level results</Button>
            {!result.rejectedDuplicateFile && (
              <>
                <Button variant="outline" render={<Link href="/movements" />}>Open movement ledger</Button>
                <Button variant="outline" render={<Link href="/exceptions" />}>Review exceptions</Button>
              </>
            )}
            <Button variant="ghost" onClick={reset}>Import another file</Button>
          </div>
        </div>
      )}
    </>
  );
}

function WizardNav({ children }: { children: ReactNode }) {
  return <div className="mt-4 flex items-center justify-between gap-3">{children}</div>;
}
