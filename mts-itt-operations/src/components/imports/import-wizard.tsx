"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, CheckCircle2, Download, FileSpreadsheet, FileX2, Loader2, Lock, PlayCircle, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useImportActions } from "@/hooks/use-imports";
import { DEFAULT_MAPPINGS } from "@/data/mock-imports";
import { processRows } from "@/lib/import-processor";
import { normaliseReport, readSheetData, type NormalisedReport, type SheetData } from "@/lib/report-formats";
import { findImportByFingerprint, type CommitImportResult } from "@/lib/mutations/import";
import { cn } from "@/lib/utils";
import { TerminalTag } from "./import-common";

const SAMPLES = [
  { terminal: "CWIT", name: "CWIT-ITT-Out-Report-sample.xlsx", href: "/documents/CWIT-ITT-Out-Report-sample.xlsx", label: "CWIT report" },
  { terminal: "SAGT", name: "SAGT-Container-Report-sample.xlsx", href: "/documents/SAGT-Container-Report-sample.xlsx", label: "SAGT report" },
] as const;

const STAGES = ["Reading the report", "Converting it to the common format", "Checking containers, trucks and drivers", "Creating movements and raising exceptions"];
const STAGE_MS = 600;
const PREVIEW_ROWS = 5;

type Phase = "upload" | "processing" | "results";

export function ImportWizard() {
  const { db } = useApp();
  const { can } = useAuth();
  const { commit } = useImportActions();

  const [phase, setPhase] = useState<Phase>("upload");
  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [report, setReport] = useState<NormalisedReport | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const [result, setResult] = useState<CommitImportResult | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  if (!can("import.run")) {
    return (
      <>
        <PageHeader title="New terminal import" description="Upload a terminal report and import it." />
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

  const load = async (file: File) => {
    setError(null);
    setReport(null);
    setSheet(null);
    setReading(true);
    try {
      const s = await readSheetData(file);
      const r = normaliseReport(db, s);
      setSheet(s);
      setReport(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the file.");
    } finally {
      setReading(false);
    }
  };

  const loadSample = async (s: (typeof SAMPLES)[number]) => {
    try {
      const blob = await (await fetch(s.href)).blob();
      await load(new File([blob], s.name, { type: blob.type }));
    } catch {
      setError("Could not load the sample report.");
    }
  };

  const clear = () => {
    setSheet(null);
    setReport(null);
    setError(null);
  };

  const duplicateOf = sheet ? findImportByFingerprint(db, sheet.fingerprint) : undefined;

  const runImport = () => {
    if (!sheet || !report) return;
    setPhase("processing");
    setStage(0);
    STAGES.forEach((_, i) => {
      if (i > 0) timers.current.push(window.setTimeout(() => setStage(i), i * STAGE_MS));
    });
    timers.current.push(
      window.setTimeout(() => {
        const mapping = { ...DEFAULT_MAPPINGS.CWIT };
        const rows = processRows({ db, terminal: report.terminal, mapping, rows: report.rows, display: report.display });
        const res = commit({ fileName: sheet.fileName, fingerprint: sheet.fingerprint, terminal: report.terminal, mapping, rows, includeDuplicateRows: [] });
        setResult(res);
        setPhase("results");
        if (res.rejectedDuplicateFile) toast.warning("Duplicate file rejected", { description: "This exact file was already imported. Nothing was counted twice." });
        else toast.success(`Import ${res.record.id} completed`, { description: `${res.record.success} movement(s) created, ${res.record.exceptionsRaised} exception(s) raised.` });
      }, STAGES.length * STAGE_MS),
    );
  };

  const reset = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    clear();
    setResult(null);
    setPhase("upload");
  };

  const created = result ? db.movements.filter((m) => result.createdMovementIds.includes(m.id)).sort((a, b) => (a.id < b.id ? -1 : 1)) : [];
  const excByMovement = new Map<string, number>();
  for (const e of db.exceptions) if (result && e.importId === result.record.id) excByMovement.set(e.movementId, (excByMovement.get(e.movementId) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="New terminal import"
        description="Upload a terminal report in its own layout. The system recognises the terminal's format and converts it to one common format before importing."
        actions={
          <Button variant="outline" render={<Link href="/terminal-imports" />}>
            Import history
          </Button>
        }
      />

      {phase === "upload" && (
        <div className="space-y-4">
          <SectionCard
            title="Upload terminal report"
            description="CWIT and SAGT send different layouts. Either one can be uploaded here."
            actions={
              <div className="flex flex-wrap gap-1">
                {SAMPLES.map((s) => (
                  <Button key={s.href} variant="outline" size="sm" render={<a href={s.href} download />} nativeButton={false}>
                    <Download /> {s.label}
                  </Button>
                ))}
              </div>
            }
          >
            {!sheet && !reading && (
              <div className="space-y-3">
                <FileDropzone
                  accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                  onFiles={(f) => load(f[0])}
                  title="Drag & drop the terminal report here"
                  hint="XLSX · XLS · CSV"
                />
                <div className="text-center text-xs text-slate">
                  or use a sample:{" "}
                  {SAMPLES.map((s, i) => (
                    <span key={s.name}>
                      {i > 0 && " · "}
                      <button type="button" className="font-medium text-brand underline" onClick={() => loadSample(s)}>
                        {s.terminal} sample report
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            {reading && (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate" role="status">
                <Loader2 className="size-4 animate-spin" /> Reading the report…
              </div>
            )}
            {error && (
              <Alert variant="destructive" className="mt-3">
                <FileX2 />
                <AlertTitle>Could not use this file</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {sheet && report && !reading && (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success">
                  <FileSpreadsheet className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{sheet.fileName}</div>
                  <div className="text-xs text-slate">
                    {sheet.fileSizeKb} KB · sheet “{sheet.sheetName}” · {report.sourceRows} container line(s) found
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={clear}>
                  <RefreshCw /> Replace file
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={clear} aria-label="Remove file">
                  <X />
                </Button>
              </div>
            )}
            {duplicateOf && (
              <Alert variant="destructive" className="mt-3">
                <FileX2 />
                <AlertTitle>Duplicate file detected</AlertTitle>
                <AlertDescription>
                  This exact file was already imported as{" "}
                  <Link href={`/terminal-imports/${duplicateOf.id}`} className="font-semibold underline">{duplicateOf.id}</Link>. Importing again records a “Rejected – Duplicate File” entry and creates no movements.
                </AlertDescription>
              </Alert>
            )}
          </SectionCard>

          {report && (
            <SectionCard
              title="Layout recognised"
              description="The file is converted to the common format the system works with."
              actions={<span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-600/20">{report.formatLabel}</span>}
            >
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate">Terminal column → common column</div>
                  <ul className="divide-y rounded-lg border text-sm">
                    {report.links.map((l) => (
                      <li key={l.common} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="w-40 shrink-0 truncate text-slate" title={l.source}>{l.source}</span>
                        <ArrowRight className="size-3.5 shrink-0 text-brand" />
                        <span className="font-medium text-ink">{l.common}</span>
                        {l.how && <span className="ml-auto hidden truncate text-xs text-slate xl:block" title={l.how}>{l.how}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate">What the system did</div>
                  <ul className="list-disc space-y-1 pl-5 text-xs text-slate">
                    {report.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate">
                  Common format · {report.rows.length} journey(s) · first {Math.min(PREVIEW_ROWS, report.rows.length)} shown
                </div>
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/40 text-left uppercase tracking-wide text-slate">
                        {["Container No", "Size", "Origin", "Destination", "Truck", "Driver", "Load Time", "Status"].map((h) => (
                          <th key={h} className="px-3 py-2 font-medium">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.rows.slice(0, PREVIEW_ROWS).map((r, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-3 py-1.5 font-mono">{r["Container No"]}</td>
                          <td className="px-3 py-1.5">{r.Size}</td>
                          <td className="px-3 py-1.5">{r.Origin}</td>
                          <td className="px-3 py-1.5">{r.Destination}</td>
                          <td className="px-3 py-1.5">{r.Truck}</td>
                          <td className="px-3 py-1.5">{r.Driver || <span className="text-danger">Missing</span>}</td>
                          <td className="whitespace-nowrap px-3 py-1.5">{r["Load Time"]}</td>
                          <td className="px-3 py-1.5">{r.Status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button variant={duplicateOf ? "destructive" : "default"} onClick={runImport}>
                  <PlayCircle /> {duplicateOf ? "Record rejected duplicate" : "Import report"}
                </Button>
              </div>
            </SectionCard>
          )}
        </div>
      )}

      {phase === "processing" && (
        <SectionCard title="Processing report" description={sheet?.fileName}>
          <ol className="space-y-3 py-2">
            {STAGES.map((label, i) => {
              const done = i < stage;
              const active = i === stage;
              return (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span className={cn("flex size-6 items-center justify-center rounded-full", done ? "bg-success text-white" : active ? "bg-navy text-white" : "bg-muted text-slate")}>
                    {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : <span className="text-xs">{i + 1}</span>}
                  </span>
                  <span className={cn(active ? "font-semibold text-navy" : done ? "text-ink" : "text-slate")}>{label}</span>
                </li>
              );
            })}
          </ol>
        </SectionCard>
      )}

      {phase === "results" && result && (
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
              <AlertTitle className="text-emerald-800">Import {result.record.id} completed</AlertTitle>
              <AlertDescription className="text-emerald-800/90">
                {result.record.fileName} · <TerminalTag code={result.record.terminal} className="text-xs" /> · read as “{report?.formatLabel}” and converted to the common format.
              </AlertDescription>
            </Alert>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatCard label="Total journeys" value={result.record.total} tone="navy" />
            <StatCard label="Movements created" value={result.record.success} tone="green" />
            <StatCard label="Invalid" value={result.record.failed} tone="red" hint={result.record.failed ? "Kept in the import record" : undefined} />
            <StatCard label="Duplicates held" value={result.record.duplicate} tone="orange" />
            <StatCard label="Exceptions raised" value={result.record.exceptionsRaised} tone="orange" hint="Billing blocked until resolved" />
          </div>

          {created.length > 0 && (
            <SectionCard title="Movements created from this report" bodyClassName="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-slate">
                      <th className="px-4 py-2 font-medium">Movement</th>
                      <th className="px-4 py-2 font-medium">Container(s)</th>
                      <th className="px-4 py-2 font-medium">Route</th>
                      <th className="px-4 py-2 font-medium">Driver</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Exceptions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {created.map((m) => {
                      const exc = excByMovement.get(m.id) ?? 0;
                      const driver = db.drivers.find((d) => d.id === m.driverId)?.name;
                      return (
                        <tr key={m.id} className="border-b last:border-0">
                          <td className="px-4 py-2">
                            <Link href={`/movements/${m.id}`} className="font-medium text-brand hover:underline">{m.id}</Link>
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">{m.containerNos.join(" + ")}</td>
                          <td className="px-4 py-2">{m.sourceTerminal} → {m.destinationTerminal}</td>
                          <td className="px-4 py-2">{driver ?? <span className="text-danger">Missing</span>}</td>
                          <td className="px-4 py-2"><StatusBadge status={m.status} /></td>
                          <td className="px-4 py-2">{exc > 0 ? <span className="font-medium text-warning">{exc} raised</span> : <span className="text-slate">–</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          <div className="flex flex-wrap gap-2">
            {!result.rejectedDuplicateFile && (
              <>
                <Button render={<Link href="/movements" />}>Open movement ledger</Button>
                <Button variant="outline" render={<Link href="/exceptions" />}>Review exceptions</Button>
              </>
            )}
            <Button variant="outline" render={<Link href={`/terminal-imports/${result.record.id}`} />}>View import record</Button>
            <Button variant="ghost" onClick={reset}>Import another file</Button>
          </div>
        </div>
      )}
    </>
  );
}
