"use client";

import { useEffect, useState } from "react";
import { FileImage, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { FormDialog } from "@/components/shared/form-dialog";
import { NativeSelect } from "@/components/shared/native-select";
import { useApp } from "@/contexts/app-context";
import { demoToday } from "@/lib/date-utils";
import { MAX_DATA_URL_KB, runExtraction, uploadDocument } from "@/lib/mutations/evidence";
import { DEMO_DRIVER_LOG, DEMO_DRIVER_LOG_DIR, demoDriverLogByName } from "@/data/demo-chits";
import { WORK_SHIFTS, SHIFT_HOURS } from "@/lib/roster-rules";
import type { DriverLogMeta } from "@/types/evidence";

export type LogPrefill = Partial<Pick<DriverLogMeta, "driverId" | "primeMoverId" | "date" | "shift">>;

const ACCEPT = "image/*,application/pdf,.pdf,.png,.jpg,.jpeg,.webp";

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("Could not read file"));
    r.readAsDataURL(file);
  });

export function DriverLogUploadDialog({ open, onOpenChange, prefill }: { open: boolean; onOpenChange: (o: boolean) => void; prefill?: LogPrefill }) {
  const { db, update } = useApp();
  const [files, setFiles] = useState<File[]>([]);
  const [driverId, setDriverId] = useState("");
  const [primeMoverId, setPrimeMoverId] = useState("");
  const [date, setDate] = useState(demoToday());
  const [shift, setShift] = useState<DriverLogMeta["shift"]>("Morning");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFiles([]);
    setError(null);
    setDriverId(prefill?.driverId ?? "");
    setPrimeMoverId(prefill?.primeMoverId ?? "");
    setDate(prefill?.date ?? demoToday());
    setShift(prefill?.shift ?? "Morning");
  }, [open, prefill]);

  const onDriver = (id: string) => {
    setDriverId(id);
    const pm = db.drivers.find((d) => d.id === id)?.primeMoverId;
    if (pm) setPrimeMoverId(pm);
  };

  const addFiles = (picked: File[]) => {
    setFiles((p) => [...p, ...picked]);
    const demo = picked.map((f) => demoDriverLogByName(f.name)).find(Boolean);
    if (demo) {
      setDriverId(demo.driverId);
      setPrimeMoverId(demo.primeMoverId);
      setDate(demo.date);
      setShift(demo.shift);
    }
  };

  const submitDemo = () => {
    update((d) => {
      const r = uploadDocument(d, {
        name: DEMO_DRIVER_LOG.fileName,
        docType: "Driver Log Sheet",
        mime: "image/png",
        sizeKb: 60,
        dataUrl: `${DEMO_DRIVER_LOG_DIR}${DEMO_DRIVER_LOG.fileName}`,
        movementId: null,
        driverLog: { driverId: DEMO_DRIVER_LOG.driverId, primeMoverId: DEMO_DRIVER_LOG.primeMoverId, date: DEMO_DRIVER_LOG.date, shift: DEMO_DRIVER_LOG.shift },
      });
      runExtraction(d, r.doc.id);
    });
    toast.success("Demo driver log submitted", { description: "Open it from the sheets list to verify the extracted values." });
    onOpenChange(false);
  };

  const submit = async () => {
    if (!files.length) return setError("Choose the driver log sheet photo or PDF.");
    if (!driverId && !primeMoverId) return setError("Select the driver or the lorry written on the sheet.");
    if (!date) return setError("Enter the date on the sheet.");
    setBusy(true);
    try {
      const prepared = await Promise.all(
        files.map(async (f) => ({ f, sizeKb: Math.max(1, Math.round(f.size / 1024)), dataUrl: f.size / 1024 < MAX_DATA_URL_KB ? await readAsDataUrl(f) : undefined })),
      );
      update((d) => {
        for (const p of prepared) {
          const r = uploadDocument(d, {
            name: p.f.name,
            docType: "Driver Log Sheet",
            mime: p.f.type,
            sizeKb: p.sizeKb,
            dataUrl: p.dataUrl,
            movementId: null,
            driverLog: { driverId: driverId || null, primeMoverId: primeMoverId || null, date, shift },
          });
          runExtraction(d, r.doc.id);
        }
      });
      toast.success(`${prepared.length} driver log sheet(s) uploaded`, { description: `${shift} shift, ${date}. Movements for that lorry / driver and shift now count as covered.` });
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Upload driver log sheet"
      description="Enter the header written on the sheet (driver, lorry, shift, date). Movements loaded in that shift for that lorry or driver are marked as covered."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !files.length}>{busy ? "Uploading…" : "Upload"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FileDropzone compact multiple accept={ACCEPT} onFiles={addFiles} title="Drag & drop the log sheet photo or PDF" hint="PNG · JPG · PDF" />
        <div className="text-center text-xs text-slate">
          or{" "}
          <button type="button" className="font-medium text-brand underline" onClick={submitDemo} disabled={busy}>
            submit the demo driver log ({db.drivers.find((d) => d.id === DEMO_DRIVER_LOG.driverId)?.name}, {DEMO_DRIVER_LOG.date} {DEMO_DRIVER_LOG.shift})
          </button>
        </div>
        {files.length > 0 && (
          <ul className="space-y-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                {f.type === "application/pdf" ? <FileText className="size-5 text-danger" /> : <FileImage className="size-5 text-brand" />}
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{f.name}</span>
                <Button variant="ghost" size="icon-sm" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Driver name">
            <NativeSelect value={driverId} onValueChange={onDriver} placeholder="Select driver" options={db.drivers.filter((d) => d.status !== "Inactive").map((d) => ({ value: d.id, label: d.name }))} />
          </Field>
          <Field label="Lorry number">
            <NativeSelect value={primeMoverId} onValueChange={setPrimeMoverId} placeholder="Select lorry" options={db.primeMovers.map((p) => ({ value: p.id, label: p.regNo }))} />
          </Field>
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8" />
          </Field>
          <Field label="Shift">
            <NativeSelect value={shift} onValueChange={(v) => setShift(v as DriverLogMeta["shift"])} options={WORK_SHIFTS.map((s) => ({ value: s, label: `${s} (${SHIFT_HOURS[s].range})` }))} />
          </Field>
        </div>
        {error && <p className="text-sm text-danger" role="alert">{error}</p>}
      </div>
    </FormDialog>
  );
}
