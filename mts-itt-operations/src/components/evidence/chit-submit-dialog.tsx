"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, CheckCircle2, FileImage, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { FormDialog } from "@/components/shared/form-dialog";
import { useApp } from "@/contexts/app-context";
import { DEMO_CHITS, type DemoChit } from "@/data/demo-chits";
import { ALL_DEMO_CHITS, anyDemoChitByName } from "@/data/demo-chit-pack";
import { submitDemoChit } from "@/lib/mutations/evidence";
import { cn } from "@/lib/utils";

const STAGES = ["Reading chit images", "Extracting container, truck, driver, terminal and time", "Matching each chit to its movement"];
const STAGE_MS = 650;

type Phase = "select" | "processing" | "results";

interface Submitted {
  docId: string;
  chit: DemoChit;
  movementId: string | null;
}

export function ChitSubmitDialog({
  open,
  onOpenChange,
  onReview,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReview: (docId: string) => void;
}) {
  const { db, update } = useApp();
  const [phase, setPhase] = useState<Phase>("select");
  const [chits, setChits] = useState<DemoChit[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [stage, setStage] = useState(0);
  const [results, setResults] = useState<Submitted[]>([]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach((t) => window.clearTimeout(t));
  }, []);

  const threshold = db.settings.ocrConfidenceThreshold;

  const addFiles = (files: File[]) => {
    const ok: DemoChit[] = [];
    const bad: string[] = [];
    for (const f of files) {
      const c = anyDemoChitByName(f.name);
      if (c) ok.push(c);
      else bad.push(f.name);
    }
    setChits((prev) => [...prev, ...ok.filter((c) => !prev.some((p) => p.fileName === c.fileName))]);
    setIgnored(bad);
  };

  const close = (o: boolean) => {
    if (!o && phase === "processing") return;
    if (!o) {
      setPhase("select");
      setChits([]);
      setIgnored([]);
      setResults([]);
    }
    onOpenChange(o);
  };

  const submit = () => {
    const batch = chits;
    setPhase("processing");
    setStage(0);
    STAGES.forEach((_, i) => {
      if (i > 0) timers.current.push(window.setTimeout(() => setStage(i), i * STAGE_MS));
    });
    timers.current.push(
      window.setTimeout(() => {
        const out = update((d) => batch.map((c) => ({ chit: c, ...submitDemoChit(d, c) })));
        setResults(out.map((o) => ({ docId: o.doc.id, chit: o.chit, movementId: o.movementId })));
        setPhase("results");
        toast.success(`${out.length} chit(s) submitted`, { description: `Chits at or above ${threshold}% confidence were verified automatically; the rest are waiting for manual verification.` });
      }, STAGES.length * STAGE_MS),
    );
  };

  const needsCheck = (c: DemoChit) => c.fields.filter((f) => f.confidence < threshold).length;

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      size="lg"
      title="Submit chits"
      description="Supervisor submission of loading and discharge chits. Each chit is matched to its movement and its values are extracted for you to verify."
      footer={
        phase === "select" ? (
          <>
            <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
            <Button disabled={chits.length === 0} onClick={submit}>Submit {chits.length || ""} chit{chits.length === 1 ? "" : "s"}</Button>
          </>
        ) : phase === "results" ? (
          <Button onClick={() => close(false)}>Done</Button>
        ) : undefined
      }
    >
      {phase === "select" && (
        <div className="space-y-3">
          {chits.length === 0 ? (
            <>
              <FileDropzone multiple accept="image/*,.png,.jpg,.jpeg" onFiles={addFiles} title="Drag & drop chit images here" hint="PNG · JPG" />
              <div className="text-center text-xs text-slate">
                or{" "}
                <button type="button" className="font-medium text-brand underline" onClick={() => setChits([...DEMO_CHITS])}>
                  use the small demo chit pack ({DEMO_CHITS.length} chits)
                </button>
                {" · "}
                <button type="button" className="font-medium text-brand underline" onClick={() => setChits(ALL_DEMO_CHITS())}>
                  use the full chit pack ({ALL_DEMO_CHITS().length} chits, 9 – 13 Nov)
                </button>
              </div>
            </>
          ) : chits.length > 12 ? (
            <div className="rounded-lg border p-4 text-sm">
              <div className="font-semibold text-ink">{chits.length} chits selected</div>
              <div className="mt-1 text-xs text-slate">
                {chits.filter((c) => c.docType === "Loading Chit").length} loading and {chits.filter((c) => c.docType === "Discharge Chit").length} discharge chits. Each is read, compared with the terminal data and any driver log, and verified automatically only if it is confident and everything agrees.
              </div>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => setChits([])}>Clear selection</Button>
            </div>
          ) : (
            <ul className="divide-y rounded-lg border">
              {chits.map((c) => (
                <li key={c.fileName} className="flex items-center gap-3 px-3 py-2 text-sm">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/documents/chits/${c.fileName}`} alt="" className="h-9 w-12 rounded border bg-white object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-ink">{c.fileName}</div>
                    <div className="text-xs text-slate">{c.docType}</div>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove ${c.fileName}`} onClick={() => setChits((p) => p.filter((x) => x.fileName !== c.fileName))}>
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {ignored.length > 0 && <p className="text-xs text-warning">Not part of the demo chit pack and skipped: {ignored.join(", ")}</p>}
        </div>
      )}

      {phase === "processing" && (
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
      )}

      {phase === "results" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="size-4" /> {results.length} chit(s) linked to movements. {results.filter((r) => db.documents.find((x) => x.id === r.docId)?.ocr?.verified).length} verified automatically (confident and in agreement with the terminal data and any driver log); the others wait for a person.
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-slate">
                  <th className="px-3 py-2 font-medium">Chit</th>
                  <th className="px-3 py-2 font-medium">Movement</th>
                  <th className="px-3 py-2 font-medium">Confidence</th>
                  <th className="px-3 py-2 font-medium">Verification</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => {
                  const n = needsCheck(r.chit);
                  return (
                    <tr key={r.docId} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <FileImage className="size-4 text-slate" />
                          <div>
                            <div className="font-medium text-ink">{r.chit.docType}</div>
                            <div className="text-xs text-slate">{r.docId}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {r.movementId ? <Link href={`/movements/${r.movementId}`} className="font-medium text-brand hover:underline">{r.movementId}</Link> : <span className="text-danger">Not matched</span>}
                      </td>
                      <td className="px-3 py-2">
                        {Math.min(...r.chit.fields.map((f) => f.confidence))}%
                        {n > 0 && <span className="ml-1 text-xs text-warning">({n} low)</span>}
                      </td>
                      <td className="px-3 py-2">
                        {db.documents.find((x) => x.id === r.docId)?.ocr?.verified ? <span className="font-medium text-success">Auto-verified</span> : <span className="font-medium text-warning">Manual check needed</span>}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => {
                            close(false);
                            onReview(r.docId);
                          }}
                        >
                          Review
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
