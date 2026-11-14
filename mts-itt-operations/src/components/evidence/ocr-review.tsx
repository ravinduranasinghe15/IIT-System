"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw, ScanText, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { EvidenceDoc, OcrField } from "@/types/evidence";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import { formatDateTime } from "@/lib/date-utils";
import { OCR_DISCLAIMER, ledgerValueFor, sameValue } from "@/lib/ocr-sim";
import { runExtraction, verifyExtraction } from "@/lib/mutations/evidence";
import { cn } from "@/lib/utils";

export function OcrDisclaimer({ compact }: { compact?: boolean }) {
  return (
    <Alert className="border-amber-300 bg-amber-50/60">
      <AlertTriangle className="text-amber-600" />
      <AlertTitle className="text-amber-800">Assisted extraction pilot – not real OCR</AlertTitle>
      {!compact && <AlertDescription className="text-amber-800/90">{OCR_DISCLAIMER}</AlertDescription>}
    </Alert>
  );
}

function ConfidencePill({ value, threshold }: { value: number; threshold: number }) {
  const tone = value >= threshold ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : value >= threshold - 12 ? "bg-amber-50 text-amber-700 ring-amber-600/20" : "bg-red-50 text-red-700 ring-red-600/20";
  return <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset", tone)}>{value}%</span>;
}

/** Editable review of the simulated extraction with mandatory human verification. */
export function OcrReview({ doc, canRun, canVerify }: { doc: EvidenceDoc; canRun: boolean; canVerify: boolean }) {
  const { db, update } = useApp();
  const threshold = db.settings.ocrConfidenceThreshold;
  const movement = doc.movementId ? (db.movements.find((m) => m.id === doc.movementId) ?? null) : null;
  const ocr = doc.ocr;
  const [draft, setDraft] = useState<OcrField[] | null>(null);
  const [confirmVerify, setConfirmVerify] = useState(false);
  const [confirmRerun, setConfirmRerun] = useState(false);

  const fields = draft ?? ocr?.fields ?? [];
  const dirty = !!ocr && !!draft && draft.some((f) => ocr.fields.find((o) => o.key === f.key)?.value !== f.value);

  const run = () => {
    const res = update((d) => runExtraction(d, doc.id));
    setDraft(null);
    if (res) toast.success("Simulated extraction complete", { description: "Review the values and verify them – this is not real OCR." });
  };

  if (!ocr) {
    return (
      <div className="space-y-3">
        <OcrDisclaimer />
        <div className="rounded-lg border border-dashed p-6 text-center">
          <ScanText className="mx-auto size-8 text-slate" />
          <div className="mt-2 text-sm font-semibold text-ink">No extraction has been run for this document</div>
          <p className="mx-auto mt-1 max-w-sm text-xs text-slate">
            The assisted extraction pilot pre-fills container, truck, driver, terminal and time fields (simulated, deterministic). A person must review and verify them.
          </p>
          <Button className="mt-3" disabled={!canRun} onClick={run} title={canRun ? undefined : "Your role cannot run extraction"}>
            <ScanText /> Run assisted extraction (simulated)
          </Button>
        </div>
      </div>
    );
  }

  const update1 = (key: string, value: string) =>
    setDraft((prev) => (prev ?? ocr.fields).map((f) => (f.key === key ? { ...f, value } : f)));

  const readOnly = ocr.verified || !canVerify;

  return (
    <div className="space-y-3">
      <OcrDisclaimer compact={ocr.verified} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate">
        <StatusBadge status={ocr.verified ? "Verified" : "Needs Verification"} />
        <span>Extracted {formatDateTime(ocr.extractedAt)}</span>
        {ocr.verified && (
          <span>
            · verified by <b className="text-ink">{ocr.verifiedBy}</b> {formatDateTime(ocr.verifiedAt)}
          </span>
        )}
        <span className="ml-auto">Confidence threshold: {threshold}% (Settings)</span>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-slate">
            <tr>
              <th className="px-3 py-2 font-semibold">Field</th>
              <th className="px-3 py-2 font-semibold">{ocr.verified ? "Verified value" : "Extracted value (editable)"}</th>
              <th className="px-3 py-2 font-semibold">Confidence</th>
              <th className="hidden px-3 py-2 font-semibold md:table-cell">Ledger value</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => {
              const ledger = ledgerValueFor(f.key, movement, doc, db);
              const differs = ledger !== null && !!f.value && !sameValue(f.value, ledger, f.key, db);
              const low = f.confidence < threshold;
              return (
                <tr key={f.key} className={cn("border-t", low && !ocr.verified && "bg-amber-50/40")}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs font-medium text-slate">{f.label}</td>
                  <td className="px-3 py-1.5">
                    {f.key === "kind" ? (
                      <span className="text-sm font-medium text-ink">{f.value}</span>
                    ) : (
                      <Input
                        aria-label={f.label}
                        type={f.key === "datetime" ? "datetime-local" : "text"}
                        value={f.value}
                        readOnly={readOnly}
                        onChange={(e) => update1(f.key, e.target.value)}
                        className={cn("h-8 max-w-44 font-mono text-xs", readOnly && "border-transparent bg-transparent px-0 shadow-none")}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <ConfidencePill value={f.confidence} threshold={threshold} />
                  </td>
                  <td className="hidden px-3 py-2 text-xs md:table-cell">
                    {ledger === null ? (
                      <span className="text-slate">No linked movement</span>
                    ) : (
                      <span className={cn("font-mono", differs && "font-semibold text-danger")}>
                        {ledger || "—"}
                        {differs && <span className="ml-1 font-sans text-[11px]">≠ differs</span>}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!movement && (
        <p className="text-xs text-slate">Link this document to a movement to compare the extracted values against the ledger.</p>
      )}

      {!ocr.verified && (
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={!canVerify} onClick={() => setConfirmVerify(true)} title={canVerify ? undefined : "Only Administrator, Operations Manager or Supervisor can verify"}>
            <ShieldCheck /> Verify extraction{dirty ? " (with corrections)" : ""}
          </Button>
          <Button variant="outline" disabled={!dirty} onClick={() => setDraft(null)}>
            <RotateCcw /> Reset edits
          </Button>
          {!canVerify && <span className="text-xs text-slate">Your role can review but not verify extractions.</span>}
        </div>
      )}
      {ocr.verified && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3.5" /> Verified – recorded in the audit log.</span>
          {canRun && (
            <Button variant="outline" size="sm" onClick={() => setConfirmRerun(true)}>
              <ScanText /> Re-run extraction
            </Button>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmVerify}
        onOpenChange={setConfirmVerify}
        title="Verify these values?"
        confirmLabel="Verify"
        description={`You confirm that the values above have been checked against the original document${dirty ? " (including your corrections)" : ""}. This is audit-logged and does not change the movement record.`}
        onConfirm={() => {
          const res = update((d) => verifyExtraction(d, doc.id, fields));
          setDraft(null);
          if (res.ok) {
            toast.success("Extraction verified", {
              description: res.differences.length ? `${res.differences.length} difference(s) vs the ledger were noted on the movement history.` : res.corrected ? `${res.corrected} field(s) corrected.` : undefined,
            });
          }
        }}
      />
      <ConfirmDialog
        open={confirmRerun}
        onOpenChange={setConfirmRerun}
        title="Re-run extraction?"
        confirmLabel="Re-run"
        description="The current verified values will be replaced by a fresh unverified extraction and will need to be verified again. The history keeps a record of both."
        onConfirm={run}
      />
    </div>
  );
}
