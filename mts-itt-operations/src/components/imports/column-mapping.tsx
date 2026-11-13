"use client";

import { AlertTriangle, Bookmark, RotateCcw, Wand2 } from "lucide-react";
import type { ParsedSheet } from "@/lib/excel-parser";
import { STD_FIELDS, type ColumnMapping, type StdFieldKey } from "@/types/import";
import type { TerminalCode } from "@/types/terminal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/shared/native-select";
import { SectionCard } from "@/components/shared/section-card";
import { missingRequiredFields } from "@/lib/import-processor";

export function ColumnMappingEditor({
  parsed,
  mapping,
  onChange,
  terminal,
  remembered,
  onReset,
  onUseRemembered,
}: {
  parsed: ParsedSheet;
  mapping: ColumnMapping;
  onChange: (m: ColumnMapping) => void;
  terminal: TerminalCode;
  remembered: ColumnMapping | undefined;
  onReset: () => void;
  onUseRemembered: () => void;
}) {
  const missing = missingRequiredFields(mapping);
  const set = (key: StdFieldKey, value: string) => {
    const next = { ...mapping };
    if (value) next[key] = value;
    else delete next[key];
    onChange(next);
  };
  const hasRemembered = !!remembered && Object.keys(remembered).length > 0;
  const duplicatesUsed = Object.values(mapping).filter((v, i, a) => v && a.indexOf(v) !== i);

  return (
    <SectionCard
      title="Map columns to standard fields"
      description={`Match this file's headers to the MTS standard fields. Your confirmed mapping is saved for ${terminal}.`}
      actions={
        <>
          {hasRemembered && (
            <Button variant="outline" size="sm" onClick={onUseRemembered}>
              <Bookmark /> Use saved {terminal} mapping
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={onReset}>
            <Wand2 /> Auto-detect
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onChange({})}>
            <RotateCcw /> Clear
          </Button>
        </>
      }
    >
      {missing.length > 0 && (
        <Alert variant="destructive" className="mb-3">
          <AlertTriangle />
          <AlertTitle>Required mapping missing</AlertTitle>
          <AlertDescription>Map the following before continuing: {missing.join(", ")}.</AlertDescription>
        </Alert>
      )}
      {duplicatesUsed.length > 0 && (
        <Alert className="mb-3 border-amber-300 bg-amber-50/60">
          <AlertTriangle className="text-amber-600" />
          <AlertDescription className="text-amber-800">
            The column “{duplicatesUsed[0]}” is mapped to more than one field. This is allowed, but double-check it is intended.
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-x-6 gap-y-3 md:grid-cols-2">
        {STD_FIELDS.map((f) => {
          const col = mapping[f.key];
          const sample = col ? parsed.display.find((r) => r[col])?.[col] : undefined;
          return (
            <div key={f.key} className="grid grid-cols-[9.5rem_1fr] items-center gap-x-3">
              <label htmlFor={`map-${f.key}`} className="text-sm font-medium text-ink">
                {f.label}
                {f.required && <span className="ml-0.5 text-danger">*</span>}
              </label>
              <div>
                <NativeSelect
                  id={`map-${f.key}`}
                  value={col ?? ""}
                  onValueChange={(v) => set(f.key, v)}
                  placeholder="— Not mapped —"
                  options={parsed.headers}
                  aria-invalid={f.required && !col}
                />
                <div className="mt-0.5 h-4 truncate text-[11px] text-slate">{sample ? `e.g. ${sample}` : f.required && !col ? "Required" : ""}</div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate">
        Source terminal defaults to the selected terminal when its column is blank. Truck, trailer and driver are matched to fleet / driver master data
        (IDs, registration numbers or names); unmatched values still import with a warning and are routed to the exception queue.
      </p>
    </SectionCard>
  );
}
