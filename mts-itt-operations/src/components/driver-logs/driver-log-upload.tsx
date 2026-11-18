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
import { DEMO_LOG_PACK, demoPackLogByName } from "@/data/demo-driver-logs";
import { driverLogStats } from "@/lib/driver-logs";
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
    // reset the form each time the dialog opens
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFiles([]);
    setError(null);
    setDriverId(prefill?.driverId ?? "");
    setPrimeMoverId(prefill?.primeMoverId ?? "");
    setDate(prefill?.date ?? demoToday());
    setShift(prefill?.shift ?? "Morning");
  }, [open, prefill]);

  const onDriver = (id: string) => {
    setDriverId(id);
    // the lorry is not tied to the driver: suggest the one the roster has him on for that shift
    const pm = db.roster.find((r) => r.driverId === id && r.date === date && r.shift === shift && r.primeMoverId)?.primeMoverId;
    if (pm && !primeMoverId) setPrimeMoverId(pm);
  };

  const addFiles = (picked: File[]) => {
    setFiles((p) => [...p, ...picked]);
    const demo = picked.map((f) => demoDriverLogByName(f.name) ?? demoPackLogByName(f.name)).find(Boolean);
    if (demo) {
      setDriverId(demo.driverId);
      setPrimeMoverId(demo.primeMoverId);
      setDate(demo.date);
      setShift(demo.shift);
    }
  };

  const submitDemo = () => {
    const auto = update((d) => {
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
      return !!d.documents.find((x) => x.id === r.doc.id)?.ocr?.verified;
    });
    toast.success("Demo driver log submitted", { description: auto ? "Confidence is above the threshold, so it was verified automatically." : "Open it from the sheets list to verify the extracted values." });
    onOpenChange(false);
  };

  /** Submits every demo sheet (13 Oct – 13 Nov) that is not on file yet: confident ones verify themselves and set the real driver. */
  const submitPack = () => {
    const sheets = [
      { fileName: DEMO_DRIVER_LOG.fileName, driverId: DEMO_DRIVER_LOG.driverId, primeMoverId: DEMO_DRIVER_LOG.primeMoverId, date: DEMO_DRIVER_LOG.date, shift: DEMO_DRIVER_LOG.shift },
      ...DEMO_LOG_PACK.filter((r) => !r.spare),
    ];
    const out = update((d) => {
      const have = new Set(d.documents.map((x) => x.name.toLowerCase()));
      let added = 0;
      let auto = 0;
      for (const s of sheets) {
        if (have.has(s.fileName.toLowerCase())) continue;
        const r = uploadDocument(d, {
          name: s.fileName,
          docType: "Driver Log Sheet",
          mime: "image/png",
          sizeKb: 30,
          dataUrl: `${DEMO_DRIVER_LOG_DIR}${s.fileName}`,
          movementId: null,
          driverLog: { driverId: s.driverId, primeMoverId: s.primeMoverId, date: s.date, shift: s.shift },
        });
        runExtraction(d, r.doc.id);
        added++;
        if (d.documents.find((x) => x.id === r.doc.id)?.ocr?.verified) auto++;
      }
      return { added, auto, missing: driverLogStats(d).missing.length };
    });
    if (out.added === 0) toast.info("The demo log pack is already on file");
    else toast.success(`${out.added} driver log sheets submitted`, { description: `${out.auto} verified automatically, ${out.added - out.auto} need a manual check. ${out.missing} movement(s) still have no log.` });
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
      const autoCount = update((d) => {
        let n = 0;
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
          if (d.documents.find((x) => x.id === r.doc.id)?.ocr?.verified) n++;
        }
        return n;
      });
      toast.success(`${prepared.length} driver log sheet(s) uploaded`, {
        description: `${shift} shift, ${date}. ${autoCount} verified automatically (confidence above threshold)${prepared.length - autoCount ? `, ${prepared.length - autoCount} need manual verification` : ""}.`,
      });
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
          {" · "}
          <button type="button" className="font-medium text-brand underline" onClick={submitPack} disabled={busy}>
            submit the demo log pack ({DEMO_LOG_PACK.filter((r) => !r.spare).length + 1} sheets, 13 Oct – 13 Nov)
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
