"use client";

import Link from "next/link";
import { useState } from "react";
import { History, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import type { DocType, EvidenceDoc } from "@/types/evidence";
import { DOC_TYPES } from "@/types/evidence";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/field";
import { FormDialog } from "@/components/shared/form-dialog";
import { NativeSelect } from "@/components/shared/native-select";
import { KeyValue } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { formatDateTime } from "@/lib/date-utils";
import { changeDocType, linkDocument } from "@/lib/mutations/evidence";
import { DocumentPreview } from "./document-preview";
import { OcrReview } from "./ocr-review";

export function ocrState(doc: EvidenceDoc): "Verified" | "Needs Verification" | "Not extracted" {
  return !doc.ocr ? "Not extracted" : doc.ocr.verified ? "Verified" : "Needs Verification";
}

function LinkControl({ doc, canEdit }: { doc: EvidenceDoc; canEdit: boolean }) {
  const { db, update } = useApp();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmUnlink, setConfirmUnlink] = useState(false);
  const movement = doc.movementId ? db.movements.find((m) => m.id === doc.movementId) : null;

  const link = () => {
    const id = value.trim().toUpperCase();
    if (!id) return setError("Enter a movement ID, e.g. MV-0385.");
    if (!db.movements.some((m) => m.id === id)) return setError(`Movement ${id} was not found.`);
    const res = update((d) => linkDocument(d, doc.id, id));
    if (!res.ok) return setError(res.error ?? "Could not link");
    setError(null);
    setValue("");
    toast.success(`${doc.id} ${doc.movementId ? "re-linked" : "linked"} to ${id}`, {
      description: res.openExceptionIds.length ? `${res.openExceptionIds.join(", ")} (missing chit) still open – resolve it in Exceptions.` : undefined,
    });
  };

  return (
    <div className="space-y-2">
      {movement ? (
        <div className="rounded-lg border bg-muted/30 p-2.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <Link href={`/movements/${movement.id}`} className="font-semibold text-brand hover:underline">{movement.id}</Link>
            <StatusBadge status={movement.status} />
          </div>
          <div className="mt-0.5 text-xs text-slate">
            {movement.containerNos.join(" / ")} · {movement.sourceTerminal} → {movement.destinationTerminal} · {formatDateTime(movement.loadingAt)}
          </div>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-2.5 text-xs text-slate">Not linked to a movement. Link it to compare extracted values with the ledger and to support missing-chit reviews.</p>
      )}
      {canEdit && (
        <>
          <Field label={doc.movementId ? "Re-link to another movement" : "Link to movement"} error={error ?? undefined}>
            <div className="flex gap-2">
              <Input value={value} onChange={(e) => { setValue(e.target.value); setError(null); }} placeholder="MV-0001" className="h-8 max-w-44 font-mono" aria-invalid={!!error} />
              <Button size="sm" onClick={link}><Link2 /> {doc.movementId ? "Re-link" : "Link"}</Button>
              {doc.movementId && (
                <Button size="sm" variant="outline" onClick={() => setConfirmUnlink(true)}><Unlink /> Unlink</Button>
              )}
            </div>
          </Field>
          <ConfirmDialog
            open={confirmUnlink}
            onOpenChange={setConfirmUnlink}
            title={`Unlink ${doc.id} from ${doc.movementId}?`}
            confirmLabel="Unlink"
            destructive
            description="The document is kept (evidence is never deleted) but no longer supports this movement. This is recorded in the document history and audit log."
            onConfirm={() => {
              update((d) => linkDocument(d, doc.id, null));
              toast.success(`${doc.id} unlinked`);
            }}
          />
        </>
      )}
    </div>
  );
}

export function DocumentDetailDialog({ doc, onClose }: { doc: EvidenceDoc | null; onClose: () => void }) {
  const { update } = useApp();
  const { can } = useAuth();
  const canUpload = can("evidence.upload");
  const canVerify = can("evidence.verify");
  const [tab, setTab] = useState("extraction");

  return (
    <FormDialog
      open={!!doc}
      onOpenChange={(o) => !o && onClose()}
      title={doc ? `${doc.id} · ${doc.name}` : "Document"}
      description={doc ? `${doc.docType} · uploaded ${formatDateTime(doc.uploadedAt)} by ${doc.uploadedBy}` : undefined}
      size="xl"
    >
      {doc && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <div>
            <div className="mb-1.5 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate">
              <span>Original document</span>
              {!doc.dataUrl && <span className="normal-case font-normal">Generated sample preview</span>}
            </div>
            <DocumentPreview doc={doc} className="w-full" />
          </div>
          <div className="min-w-0">
            <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
              <TabsList>
                <TabsTrigger value="extraction">Assisted extraction</TabsTrigger>
                <TabsTrigger value="details">Details & link</TabsTrigger>
                <TabsTrigger value="history">History ({doc.history.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="extraction" className="pt-3">
                <OcrReview key={`${doc.id}-${doc.ocr?.extractedAt ?? "none"}-${doc.ocr?.verified ? "v" : "u"}`} doc={doc} canRun={canUpload} canVerify={canVerify} />
              </TabsContent>
              <TabsContent value="details" className="space-y-4 pt-3">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <KeyValue label="Document ID">{doc.id}</KeyValue>
                  <KeyValue label="File type">{doc.mime}</KeyValue>
                  <KeyValue label="Size">{doc.sizeKb} KB</KeyValue>
                  <KeyValue label="Uploaded">{formatDateTime(doc.uploadedAt)}</KeyValue>
                  <KeyValue label="Uploaded by">{doc.uploadedBy}</KeyValue>
                  <KeyValue label="Extraction"><StatusBadge status={ocrState(doc)} /></KeyValue>
                </dl>
                <Field label="Document type">
                  <NativeSelect
                    className="max-w-56"
                    value={doc.docType}
                    disabled={!canUpload}
                    options={DOC_TYPES}
                    onValueChange={(v) => {
                      if (update((d) => changeDocType(d, doc.id, v as DocType))) toast.success(`Type changed to ${v}`);
                    }}
                  />
                </Field>
                <div>
                  <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate">Linked movement</div>
                  <LinkControl doc={doc} canEdit={canUpload} />
                </div>
              </TabsContent>
              <TabsContent value="history" className="pt-3">
                <ol className="relative space-y-3 border-l pl-4">
                  {[...doc.history].reverse().map((h, i) => (
                    <li key={`${h.at}-${i}`} className="relative">
                      <span className="absolute -left-[1.4rem] top-0.5 flex size-4 items-center justify-center rounded-full border bg-card"><History className="size-2.5 text-slate" /></span>
                      <div className="text-sm text-ink">{h.action}</div>
                      <div className="text-xs text-slate">{h.by} · {formatDateTime(h.at)}</div>
                    </li>
                  ))}
                </ol>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
    </FormDialog>
  );
}
