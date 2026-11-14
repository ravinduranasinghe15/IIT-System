"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, CheckCircle2, Download, FileSpreadsheet, FileX2, Loader2, Lock, PlayCircle, RefreshCw, X } from "lucide-react";
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
import { DEMO_FILE_HREF, DEMO_FILE_NAME, DEMO_ROWS } from "@/data/demo-import";
import { DEFAULT_MAPPINGS } from "@/data/mock-imports";
import { processRows } from "@/lib/import-processor";
import type { CommitImportResult } from "@/lib/mutations/import";
import { cn } from "@/lib/utils";
import { TerminalTag } from "./import-common";

/** Fixed fingerprint: the demo always imports the same report, so a second run demonstrates duplicate-file rejection. */
const DEMO_FINGERPRINT = "demo-terminal-report-v1";

const STAGES = [
  "Reading terminal report",
  "Matching drivers, trucks and trailers to master data",
  "Creating movements in the ledger",
  "Reconciling and raising exceptions",
];
const STAGE_MS = 650;

type Phase = "upload" | "processing" | "results";

interface PickedFile {
  name: string;
  sizeKb: number;
}

export function ImportWizard() {
  const { db } = useApp();
  const { can } = useAuth();
  const { commit } = useImportActions();

  const [phase, setPhase] = useState<Phase>("upload");
  const [picked, setPicked] = useState<PickedFile | null>(null);
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

  const runImport = () => {
    if (!picked) return;
    setPhase("processing");
    setStage(0);
    STAGES.forEach((_, i) => {
      if (i === 0) return;
      timers.current.push(window.setTimeout(() => setStage(i), i * STAGE_MS));
    });
    timers.current.push(
      window.setTimeout(() => {
        const terminal = "CWIT" as const;
        const mapping = { ...DEFAULT_MAPPINGS[terminal] };
        const rows = processRows({ db, terminal, mapping, rows: DEMO_ROWS, display: DEMO_ROWS });
        const res = commit({ fileName: picked.name, fingerprint: DEMO_FINGERPRINT, terminal, mapping, rows, includeDuplicateRows: [] });
        setResult(res);
        setPhase("results");
        if (res.rejectedDuplicateFile) toast.warning("Duplicate file rejected", { description: "This report was already imported. Nothing was counted twice." });
        else toast.success(`Import ${res.record.id} completed`, { description: `${res.record.success} movement(s) created, ${res.record.exceptionsRaised} exception(s) raised.` });
      }, STAGES.length * STAGE_MS),
    );
  };

  const reset = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    setPicked(null);
    setResult(null);
    setPhase("upload");
  };

  const created = result ? db.movements.filter((m) => result.createdMovementIds.includes(m.id)) : [];
  const excByMovement = new Map<string, number>();
  for (const e of db.exceptions) if (result && e.importId === result.record.id) excByMovement.set(e.movementId, (excByMovement.get(e.movementId) ?? 0) + 1);

  return (
    <>
      <PageHeader
        title="New terminal import"
        description="Upload the terminal report. The system reads it, creates the movements and raises exceptions automatically."
        actions={
          <Button variant="outline" render={<Link href="/terminal-imports" />}>
            <ArrowLeft /> Import history
          </Button>
        }
      />

      {phase === "upload" && (
        <SectionCard
          title="Upload terminal report"
          description="Use the prepared demo report for the walkthrough."
          actions={
            <Button variant="outline" size="sm" render={<a href={DEMO_FILE_HREF} download />}>
              <Download /> Download demo report
            </Button>
          }
        >
          {!picked ? (
            <div className="space-y-3">
              <FileDropzone
                accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                onFiles={(f) => setPicked({ name: f[0].name, sizeKb: Math.max(1, Math.round(f[0].size / 1024)) })}
                title="Drag & drop the terminal report here"
                hint="XLSX · XLS · CSV"
              />
              <div className="text-center text-xs text-slate">
                or{" "}
                <button type="button" className="font-medium text-brand underline" onClick={() => setPicked({ name: DEMO_FILE_NAME, sizeKb: 9 })}>
                  use the demo report ({DEMO_FILE_NAME})
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-success/10 text-success">
                  <FileSpreadsheet className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{picked.name}</div>
                  <div className="text-xs text-slate">{picked.sizeKb} KB · ready to import</div>
                </div>
                <Button variant="outline" size="sm" onClick={() => setPicked(null)}>
                  <RefreshCw /> Replace file
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => setPicked(null)} aria-label="Remove file">
                  <X />
                </Button>
              </div>
              <div className="flex justify-end">
                <Button onClick={runImport}>
                  <PlayCircle /> Import report
                </Button>
              </div>
            </div>
          )}
        </SectionCard>
      )}

      {phase === "processing" && (
        <SectionCard title="Processing report" description={picked?.name}>
          <ol className="space-y-3 py-2">
            {STAGES.map((label, i) => {
              const done = i < stage;
              const active = i === stage;
              return (
                <li key={label} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full",
                      done ? "bg-success text-white" : active ? "bg-navy text-white" : "bg-muted text-slate",
                    )}
                  >
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
                {result.record.fileName} · <TerminalTag code={result.record.terminal} className="text-xs" /> · the movement ledger, exceptions and dashboard now reflect these rows.
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
