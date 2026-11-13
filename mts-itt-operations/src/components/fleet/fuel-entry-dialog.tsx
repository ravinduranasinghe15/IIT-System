"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { FileText, X } from "lucide-react";
import { toast } from "sonner";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useFleetActions } from "@/hooks/use-fleet";
import { demoToday } from "@/lib/date-utils";
import type { ManualFuelInput } from "@/lib/mutations/fuel";

const MAX_INLINE_KB = 1500;
const num = (msg: string) => z.string().regex(/^\d+(\.\d+)?$/, msg);

const schema = z.object({
  vehicleId: z.string().min(1, "Select a vehicle"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Select the fuel date"),
  litres: num("Enter litres as a positive number").refine((v) => Number(v) > 0 && Number(v) <= 2000, "Litres must be between 0 and 2,000"),
  amount: z.string().refine((v) => v === "" || /^\d+(\.\d{1,2})?$/.test(v), "Enter a valid amount"),
  station: z.string().max(80),
  invoiceNo: z.string().max(40),
  odometerKm: z.string().refine((v) => v === "" || /^\d{1,7}$/.test(v), "Whole km only"),
  note: z.string().max(200),
});
type Values = z.infer<typeof schema>;

/** Manual fuel entry with an optional fuel-invoice attachment (stored as an EvidenceDoc of type "Fuel Invoice"). */
export function FuelEntryDialog({ open, onOpenChange, vehicleId }: { open: boolean; onOpenChange: (o: boolean) => void; vehicleId?: string }) {
  const { db } = useApp();
  const { canSeeFinancials } = useAuth();
  const actions = useFleetActions();
  const [file, setFile] = useState<File | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { vehicleId: vehicleId ?? "", date: demoToday(), litres: "", amount: "", station: "", invoiceNo: "", odometerKm: "", note: "" },
  });

  const readFile = (f: File) =>
    new Promise<string | undefined>((resolve) => {
      if (f.size / 1024 > MAX_INLINE_KB) return resolve(undefined);
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === "string" ? r.result : undefined);
      r.onerror = () => resolve(undefined);
      r.readAsDataURL(f);
    });

  const submit = handleSubmit(async (v) => {
    if (v.date > demoToday()) {
      setError("date", { message: "Fuel date cannot be in the future" });
      return;
    }
    if (v.invoiceNo.trim() && db.fuelRecords.some((r) => r.vehicleId === v.vehicleId && r.invoiceNo?.toLowerCase() === v.invoiceNo.trim().toLowerCase())) {
      setError("invoiceNo", { message: "This invoice number is already recorded for the vehicle" });
      return;
    }
    const input: ManualFuelInput = {
      vehicleId: v.vehicleId,
      date: v.date,
      litres: Number(v.litres),
      amount: v.amount ? Number(v.amount) : undefined,
      station: v.station,
      invoiceNo: v.invoiceNo,
      odometerKm: v.odometerKm ? Number(v.odometerKm) : undefined,
      note: v.note,
      attachment: file ? { name: file.name, mime: file.type || "application/octet-stream", sizeKb: Math.max(1, Math.round(file.size / 1024)), dataUrl: await readFile(file) } : null,
    };
    if (file && !input.attachment?.dataUrl) toast.info("Attachment is large – the record was saved with file details only (no preview).");
    if (actions.addFuel(input)) onOpenChange(false);
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add fuel entry"
      description="Manual fuel-station entry. Original GPS and invoice records are never overwritten."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="fuel-entry-form">
            Save entry
          </Button>
        </>
      }
    >
      <form id="fuel-entry-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Vehicle" required error={errors.vehicleId?.message}>
          <Controller control={control} name="vehicleId" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} disabled={!!vehicleId} placeholder="Select vehicle" options={db.primeMovers.map((p) => ({ value: p.id, label: `${p.id} · ${p.regNo}` }))} />} />
        </Field>
        <Field label="Date" required error={errors.date?.message}>
          <Input type="date" {...register("date")} />
        </Field>
        <Field label="Litres" required error={errors.litres?.message}>
          <Input inputMode="decimal" placeholder="e.g. 120.5" {...register("litres")} />
        </Field>
        {canSeeFinancials && (
          <Field label={`Amount (${db.settings.currency})`} error={errors.amount?.message}>
            <Input inputMode="decimal" placeholder="optional" {...register("amount")} />
          </Field>
        )}
        <Field label="Fuel station" error={errors.station?.message}>
          <Input placeholder="e.g. Ceypetco Peliyagoda" {...register("station")} />
        </Field>
        <Field label="Invoice no" error={errors.invoiceNo?.message}>
          <Input placeholder="e.g. FS-20260101" {...register("invoiceNo")} />
        </Field>
        <Field label="Odometer (km)" error={errors.odometerKm?.message}>
          <Input inputMode="numeric" placeholder="optional" {...register("odometerKm")} />
        </Field>
        <Field label="Note" error={errors.note?.message}>
          <Textarea rows={1} {...register("note")} />
        </Field>
        <div className="sm:col-span-2">
          <div className="mb-1 text-xs font-medium text-slate">Fuel invoice attachment (optional)</div>
          {file ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
              <FileText className="size-4 text-brand" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <span className="text-xs text-slate">{Math.max(1, Math.round(file.size / 1024))} KB</span>
              <Button type="button" variant="ghost" size="icon-xs" aria-label="Remove attachment" onClick={() => setFile(null)}>
                <X />
              </Button>
            </div>
          ) : (
            <FileDropzone compact accept="image/*,application/pdf" onFiles={(f) => setFile(f[0])} title="Drop the fuel invoice here" hint="image or PDF" />
          )}
          <p className="mt-1 text-xs text-slate">Stored in Chits & Evidence as a document of type &quot;Fuel Invoice&quot;.</p>
        </div>
      </form>
    </FormDialog>
  );
}
