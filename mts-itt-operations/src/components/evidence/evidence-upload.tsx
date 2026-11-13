"use client";

import { useState } from "react";
import { FileImage, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { Field } from "@/components/shared/field";
import { FormDialog } from "@/components/shared/form-dialog";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { DOC_TYPES, type DocType } from "@/types/evidence";
import { MAX_DATA_URL_KB, runExtraction, uploadDocument } from "@/lib/mutations/evidence";

interface Pending {
  key: string;
  file: File;
  docType: DocType;
}

export function guessDocType(name: string): DocType {
  const n = name.toLowerCase();
  if (/discharge|(^|[^a-z])dc[_\- .]/.test(n)) return "Discharge Chit";
  if (/fuel|invoice|station/.test(n)) return "Fuel Invoice";
  if (/log|roster|sheet/.test(n)) return "Driver Log Sheet";
  if (/load|(^|[^a-z])lc[_\- .]/.test(n) || /chit/.test(n)) return "Loading Chit";
  return "Loading Chit";
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not read file"));
    r.readAsDataURL(file);
  });
}

const ACCEPT = "image/*,application/pdf,.pdf,.png,.jpg,.jpeg,.webp";

export function EvidenceUploadDialog({
  open,
  onOpenChange,
  defaultMovementId,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMovementId?: string;
  onUploaded?: (docIds: string[]) => void;
}) {
  const { db, update } = useApp();
  const [items, setItems] = useState<Pending[]>([]);
  const [movementId, setMovementId] = useState(defaultMovementId ?? "");
  const [extract, setExtract] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const movement = movementId ? db.movements.find((m) => m.id === movementId.trim().toUpperCase()) : undefined;
  const movementInvalid = !!movementId.trim() && !movement;

  const close = (o: boolean) => {
    if (!o) {
      setItems([]);
      setError(null);
      setMovementId(defaultMovementId ?? "");
    }
    onOpenChange(o);
  };

  const addFiles = (files: File[]) => {
    const ok: Pending[] = [];
    for (const f of files) {
      const valid = f.type.startsWith("image/") || f.type === "application/pdf" || /\.(pdf|png|jpe?g|webp)$/i.test(f.name);
      if (!valid) {
        toast.error(`${f.name}: only images and PDFs can be uploaded`);
        continue;
      }
      ok.push({ key: `${f.name}-${f.size}-${f.lastModified}`, file: f, docType: guessDocType(f.name) });
    }
    setItems((prev) => [...prev, ...ok.filter((n) => !prev.some((p) => p.key === n.key))]);
    setError(null);
  };

  const submit = async () => {
    if (!items.length) return setError("Choose at least one file to upload.");
    if (movementInvalid) return setError(`Movement ${movementId} was not found.`);
    setBusy(true);
    try {
      const prepared = await Promise.all(
        items.map(async (it) => ({
          it,
          sizeKb: Math.max(1, Math.round(it.file.size / 1024)),
          dataUrl: it.file.size / 1024 < MAX_DATA_URL_KB ? await readAsDataUrl(it.file) : undefined,
        })),
      );
      const linkId = movement?.id ?? null;
      const out = update((d) => {
        const created: { id: string; open: string[]; stored: boolean }[] = [];
        for (const p of prepared) {
          const r = uploadDocument(d, { name: p.it.file.name, docType: p.it.docType, mime: p.it.file.type, sizeKb: p.sizeKb, dataUrl: p.dataUrl, movementId: linkId });
          if (extract) runExtraction(d, r.doc.id);
          created.push({ id: r.doc.id, open: r.openExceptionIds, stored: r.storedPreview });
        }
        return created;
      });
      const open = Array.from(new Set(out.flatMap((o) => o.open)));
      toast.success(`${out.length} document(s) uploaded${linkId ? ` and linked to ${linkId}` : ""}`, {
        description: [
          extract ? "Simulated extraction is ready for human verification." : null,
          open.length ? `Related missing-chit exception(s) ${open.join(", ")} remain open – review them in Exceptions.` : null,
          out.some((o) => !o.stored) ? "Large file(s): metadata stored only, no preview after this session." : null,
        ]
          .filter(Boolean)
          .join(" "),
      });
      onUploaded?.(out.map((o) => o.id));
      setItems([]);
      close(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title="Upload chits & evidence"
      description="Images and PDFs. Files under ~600 KB are kept in browser storage for preview; larger files keep metadata only."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !items.length}>{busy ? "Uploading…" : `Upload ${items.length || ""} file${items.length === 1 ? "" : "s"}`}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FileDropzone compact multiple accept={ACCEPT} onFiles={addFiles} title="Drag & drop chit photos or PDFs" hint="PNG · JPG · PDF" />
        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.key} className="flex flex-wrap items-center gap-2 rounded-lg border p-2">
                {it.file.type === "application/pdf" ? <FileText className="size-5 shrink-0 text-danger" /> : <FileImage className="size-5 shrink-0 text-brand" />}
                <div className="min-w-0 flex-1 basis-40">
                  <div className="truncate text-sm font-medium text-ink">{it.file.name}</div>
                  <div className="text-xs text-slate">
                    {Math.max(1, Math.round(it.file.size / 1024))} KB{it.file.size / 1024 >= MAX_DATA_URL_KB ? " · metadata only (too large to store)" : ""}
                  </div>
                </div>
                <NativeSelect
                  className="w-40"
                  value={it.docType}
                  onValueChange={(v) => setItems((p) => p.map((x) => (x.key === it.key ? { ...x, docType: v as DocType } : x)))}
                  options={DOC_TYPES}
                  aria-label={`Type of ${it.file.name}`}
                />
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${it.file.name}`} onClick={() => setItems((p) => p.filter((x) => x.key !== it.key))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Field
          label="Link to movement (optional)"
          error={movementInvalid ? `No movement with ID ${movementId.trim().toUpperCase()}` : undefined}
          hint={movement ? `${movement.containerNos.join(" / ")} · ${movement.sourceTerminal} → ${movement.destinationTerminal} · ${movement.status}` : "Type a movement ID such as MV-0385. Unlinked documents can be linked later."}
        >
          <Input
            list="evidence-movement-ids"
            value={movementId}
            onChange={(e) => setMovementId(e.target.value)}
            placeholder="MV-0001"
            aria-invalid={movementInvalid}
            className="h-8 max-w-xs font-mono"
          />
          <datalist id="evidence-movement-ids">
            {db.movements.slice(-60).reverse().map((m) => (
              <option key={m.id} value={m.id}>{`${m.containerNos[0]} ${m.sourceTerminal}→${m.destinationTerminal}`}</option>
            ))}
          </datalist>
        </Field>
        <label className="flex items-start gap-2 text-sm text-ink">
          <Checkbox checked={extract} onCheckedChange={(v) => setExtract(Boolean(v))} className="mt-0.5" />
          <span>
            Run simulated assisted extraction after upload
            <span className="block text-xs text-slate">Pilot demonstration only – not real OCR. Every extraction needs human verification.</span>
          </span>
        </label>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </div>
    </FormDialog>
  );
}
