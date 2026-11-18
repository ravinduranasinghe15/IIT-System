"use client";

import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Info, Paperclip, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/shared/field";
import { NativeSelect } from "@/components/shared/native-select";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { SectionCard } from "@/components/shared/section-card";
import { useApp } from "@/contexts/app-context";
import { checkContainerNo, normalizeContainerNo } from "@/lib/container";
import { unitsFor } from "@/lib/eligibility";
import { ASSUMPTION_NOTE } from "@/lib/constants";
import { validateJourney, type MovementInput } from "@/lib/mutations/movement";
import { MAX_INLINE_KB, type AttachmentInput } from "@/hooks/use-movements";
import { DOC_TYPES, type DocType } from "@/types/evidence";
import { MOVEMENT_STATUSES, type Movement } from "@/types/movement";
import { TERMINAL_CODES, type ContainerSize, type TerminalCode } from "@/types/terminal";
import type { DB } from "@/types/db";

const SIZES: ContainerSize[] = ["20FT", "40FT"];

const CHECK_MSG: Record<string, string> = {
  format: "Invalid format – expected 4 letters (ending in U, J or Z) + 7 digits, e.g. MSCU 123456 7.",
  "check-digit": "ISO 6346 check digit does not match – please re-check the number.",
};

function makeSchema(db: DB, requireReason: boolean) {
  return z
    .object({
      containerSize: z.enum(["20FT", "40FT"]),
      containerNo1: z.string(),
      containerNo2: z.string(),
      sourceTerminal: z.string().min(1, "Select the source terminal"),
      destinationTerminal: z.string().min(1, "Select the destination terminal"),
      primeMoverId: z.string(),
      trailerId: z.string(),
      driverId: z.string(),
      loadingAt: z.string().min(1, "Loading date/time is required"),
      dischargeAt: z.string(),
      status: z.enum(MOVEMENT_STATUSES),
      notes: z.string().max(500, "Notes are limited to 500 characters"),
      docType: z.enum(DOC_TYPES),
      reason: z.string(),
    })
    .superRefine((v, ctx) => {
      const nos: string[] = [];
      (["containerNo1", "containerNo2"] as const).forEach((k) => {
        const raw = v[k].trim();
        if (!raw) return;
        const res = checkContainerNo(raw);
        if (res !== "ok") ctx.addIssue({ code: "custom", path: [k], message: CHECK_MSG[res] ?? "Invalid container number" });
        else nos.push(normalizeContainerNo(raw));
      });
      if (!v.containerNo1.trim() && v.containerNo2.trim()) ctx.addIssue({ code: "custom", path: ["containerNo1"], message: "Enter the first container number before the second." });
      if (!v.containerNo1.trim() && !v.containerNo2.trim()) {
        ctx.addIssue({ code: "custom", path: ["containerNo1"], message: "At least one container number is required." });
      } else if (nos.length > 0) {
        const journey = validateJourney(v.containerSize, nos);
        if (journey) ctx.addIssue({ code: "custom", path: [v.containerNo2.trim() ? "containerNo2" : "containerNo1"], message: journey });
      }
      if (v.sourceTerminal && v.destinationTerminal) {
        if (v.sourceTerminal === v.destinationTerminal) ctx.addIssue({ code: "custom", path: ["destinationTerminal"], message: "Destination must differ from the source terminal." });
        else if (!db.routes.some((r) => r.source === v.sourceTerminal && r.destination === v.destinationTerminal && r.status !== "Inactive"))
          ctx.addIssue({ code: "custom", path: ["destinationTerminal"], message: "No active route is configured for this source and destination." });
      }
      if (v.loadingAt && v.dischargeAt && v.dischargeAt < v.loadingAt)
        ctx.addIssue({ code: "custom", path: ["dischargeAt"], message: "Discharge time cannot be before loading time." });
      if (requireReason && !v.reason.trim()) ctx.addIssue({ code: "custom", path: ["reason"], message: "Provide a reason for this correction (audit logged)." });
    });
}

type Values = z.infer<ReturnType<typeof makeSchema>>;

function defaultsFrom(m: Movement | undefined): Values {
  return {
    containerSize: m?.containerSize ?? "40FT",
    containerNo1: m?.containerNos[0] ?? "",
    containerNo2: m?.containerNos[1] ?? "",
    sourceTerminal: m?.sourceTerminal ?? "",
    destinationTerminal: m?.destinationTerminal ?? "",
    primeMoverId: m?.primeMoverId ?? "",
    trailerId: m?.trailerId ?? "",
    driverId: m?.driverId ?? "",
    loadingAt: m?.loadingAt ?? "",
    dischargeAt: m?.dischargeAt ?? "",
    status: m?.status ?? "Pending",
    notes: m?.notes ?? "",
    docType: "Loading Chit",
    reason: "",
  };
}

export interface MovementFormSubmit {
  input: MovementInput;
  reason: string;
  attachment?: AttachmentInput;
}

export function MovementForm({
  formId,
  initial,
  onSubmit,
  showAttachment,
  requireReason,
}: {
  formId: string;
  initial?: Movement;
  onSubmit: (v: MovementFormSubmit) => void;
  showAttachment?: boolean;
  requireReason?: boolean;
}) {
  const { db } = useApp();
  const schema = useMemo(() => makeSchema(db, !!requireReason), [db, requireReason]);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaultsFrom(initial), mode: "onTouched" });
  const { register, control, handleSubmit, setValue, formState } = form;
  const errors = formState.errors;
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const size = useWatch({ control, name: "containerSize" });
  const c1 = useWatch({ control, name: "containerNo1" });
  const c2 = useWatch({ control, name: "containerNo2" });
  const source = useWatch({ control, name: "sourceTerminal" });
  const status = useWatch({ control, name: "status" });
  const discharge = useWatch({ control, name: "dischargeAt" });

  const activeRoutes = db.routes.filter((r) => r.status !== "Inactive");
  const sources = [...new Set(activeRoutes.map((r) => r.source))];
  const destinations = activeRoutes.filter((r) => r.source === source).map((r) => r.destination);
  const termLabel = (c: TerminalCode) => {
    const t = db.terminals.find((x) => x.code === c);
    return { value: c, label: `${c}${t && t.status === "Conditional" ? " (conditional)" : ""}` };
  };

  const entered = [c1, c2].map((c) => c.trim()).filter(Boolean);
  const nContainers = size === "40FT" ? Math.min(entered.length, 1) || 0 : entered.length;
  const units = unitsFor({ containerNos: entered } as Movement, db.settings.billingUnitMode);

  const submit = handleSubmit(async (v) => {
    const containerNos = [v.containerNo1, v.containerNo2].map((c) => c.trim()).filter(Boolean).map(normalizeContainerNo);
    let attachment: AttachmentInput | undefined;
    if (showAttachment && file) {
      const sizeKb = Math.max(1, Math.round(file.size / 1024));
      let dataUrl: string | undefined;
      if (sizeKb <= MAX_INLINE_KB) {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const r = new FileReader();
          r.onload = () => resolve(String(r.result));
          r.onerror = () => reject(r.error);
          r.readAsDataURL(file);
        }).catch(() => undefined);
      }
      attachment = { name: file.name, mime: file.type || "application/octet-stream", sizeKb, docType: v.docType as DocType, dataUrl };
    }
    onSubmit({
      input: {
        containerNos,
        containerSize: v.containerSize,
        sourceTerminal: v.sourceTerminal as TerminalCode,
        destinationTerminal: v.destinationTerminal as TerminalCode,
        primeMoverId: v.primeMoverId || null,
        trailerId: v.trailerId || null,
        driverId: v.driverId || null,
        loadingAt: v.loadingAt || null,
        dischargeAt: v.dischargeAt || null,
        status: v.status,
        notes: v.notes.trim(),
      },
      reason: v.reason.trim(),
      attachment,
    });
  });

  const pmOptions = db.primeMovers.filter((p) => p.status === "Active" || p.id === initial?.primeMoverId).map((p) => ({ value: p.id, label: `${p.id} · ${p.regNo}` }));
  const trailerOptions = db.trailers.filter((t) => t.status === "Active" || t.id === initial?.trailerId).map((t) => ({ value: t.id, label: `${t.id} · ${t.regNo}` }));
  const driverOptions = db.drivers.filter((d) => d.status === "Active" || d.id === initial?.driverId).map((d) => ({ value: d.id, label: `${d.name} (${d.id})` }));

  return (
    <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
      <SectionCard title="Containers & journey" description="One physical journey = one 40FT container or up to two 20FT containers on one trailer">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Container size" required>
            <Controller
              control={control}
              name="containerSize"
              render={({ field }) => (
                <NativeSelect
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    if (v === "40FT") setValue("containerNo2", "");
                  }}
                  options={SIZES}
                  aria-label="Container size"
                />
              )}
            />
          </Field>
          <Field label="Container number 1" required error={errors.containerNo1?.message} hint="ISO 6346, e.g. MSCU1234567">
            <Input {...register("containerNo1")} placeholder="MSCU1234567" className="font-mono uppercase" aria-invalid={!!errors.containerNo1} autoComplete="off" />
          </Field>
          <Field label="Container number 2 (20FT only)" error={errors.containerNo2?.message} hint={size === "40FT" ? "Disabled – a 40FT journey carries one container" : "Optional second 20FT on the same trailer"}>
            <Input {...register("containerNo2")} placeholder="Optional" disabled={size === "40FT"} className="font-mono uppercase" aria-invalid={!!errors.containerNo2} autoComplete="off" />
          </Field>
        </div>
        <div className="mt-3 flex gap-2 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-semibold">
              One physical journey, {nContainers || 1} container unit{(nContainers || 1) === 1 ? "" : "s"}
            </div>
            <p className="mt-0.5">
              A trailer carrying two 20FT containers is recorded as <b>one</b> journey with both container numbers stored on it – never two journeys. Under the current demo billing rule ({db.settings.billingUnitMode}) this
              journey counts as <b>{units}</b> billable unit{units === 1 ? "" : "s"}. {ASSUMPTION_NOTE}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Route" description="Only active routes can be selected">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Source terminal" required error={errors.sourceTerminal?.message}>
            <Controller
              control={control}
              name="sourceTerminal"
              render={({ field }) => (
                <NativeSelect
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    setValue("destinationTerminal", "");
                  }}
                  placeholder="Select source…"
                  options={TERMINAL_CODES.filter((c) => sources.includes(c)).map(termLabel)}
                  aria-label="Source terminal"
                />
              )}
            />
          </Field>
          <Field label="Destination terminal" required error={errors.destinationTerminal?.message}>
            <Controller
              control={control}
              name="destinationTerminal"
              render={({ field }) => (
                <NativeSelect
                  value={field.value}
                  onValueChange={field.onChange}
                  placeholder={source ? "Select destination…" : "Select source first"}
                  disabled={!source}
                  options={destinations.map(termLabel)}
                  aria-label="Destination terminal"
                />
              )}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Truck, trailer & driver">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Prime mover">
            <Controller
              control={control}
              name="primeMoverId"
              render={({ field }) => (
                <NativeSelect
                  value={field.value}
                  onValueChange={(v) => {
                    field.onChange(v);
                    const pm = db.primeMovers.find((p) => p.id === v);
                    if (pm) {
                      if (!form.getValues("trailerId") && pm.trailerId) setValue("trailerId", pm.trailerId);
                    }
                  }}
                  placeholder="Not recorded"
                  options={pmOptions}
                  aria-label="Prime mover"
                />
              )}
            />
          </Field>
          <Field label="Trailer">
            <Controller control={control} name="trailerId" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} placeholder="Not recorded" options={trailerOptions} aria-label="Trailer" />} />
          </Field>
          <Field label="Driver" hint="Missing driver raises an exception">
            <Controller control={control} name="driverId" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} placeholder="Not recorded" options={driverOptions} aria-label="Driver" />} />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Timing & status">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Loading date & time" required error={errors.loadingAt?.message}>
            <Input type="datetime-local" {...register("loadingAt")} aria-invalid={!!errors.loadingAt} />
          </Field>
          <Field
            label="Discharge date & time"
            error={errors.dischargeAt?.message}
            hint={!discharge && ["Completed", "Rejected", "Damaged"].includes(status) ? "Missing arrival time will raise an exception" : undefined}
          >
            <Input type="datetime-local" {...register("dischargeAt")} aria-invalid={!!errors.dischargeAt} />
          </Field>
          <Field label="Status" required>
            <Controller control={control} name="status" render={({ field }) => <NativeSelect value={field.value} onValueChange={field.onChange} options={MOVEMENT_STATUSES} aria-label="Status" />} />
          </Field>
        </div>
        <Field label="Notes" error={errors.notes?.message} className="mt-3">
          <Textarea {...register("notes")} rows={2} placeholder="Operational notes (optional)" />
        </Field>
      </SectionCard>

      {showAttachment && (
        <SectionCard title="Supporting document" description={`Optional chit or log sheet (images/PDF). Files up to ${MAX_INLINE_KB} KB are stored in browser demo storage.`}>
          {file ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/40 p-2.5 text-sm">
              <Paperclip className="size-4 text-slate" />
              <span className="min-w-0 flex-1 truncate">
                {file.name} <span className="text-xs text-slate">({Math.max(1, Math.round(file.size / 1024))} KB)</span>
              </span>
              <Controller control={control} name="docType" render={({ field }) => <NativeSelect className="w-44" value={field.value} onValueChange={field.onChange} options={DOC_TYPES} aria-label="Document type" />} />
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFile(null)} aria-label="Remove attachment">
                <X />
              </Button>
            </div>
          ) : (
            <FileDropzone
              compact
              accept="image/*,application/pdf"
              hint="PNG, JPG or PDF"
              title="Drop a supporting document"
              onFiles={(files) => {
                const f = files[0];
                if (f && !(f.type.startsWith("image/") || f.type === "application/pdf")) {
                  setFileError("Only image or PDF files can be attached.");
                  return;
                }
                setFileError(null);
                setFile(f ?? null);
              }}
            />
          )}
          {fileError && <p className="mt-1 text-xs text-danger">{fileError}</p>}
        </SectionCard>
      )}

      {requireReason && (
        <SectionCard title="Correction reason" description="Recorded in the movement history and the audit log">
          <Field label="Reason for change" required error={errors.reason?.message}>
            <Textarea {...register("reason")} rows={2} placeholder="e.g. Container number corrected from terminal report" />
          </Field>
        </SectionCard>
      )}
    </form>
  );
}
