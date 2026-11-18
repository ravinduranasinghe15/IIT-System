"use client";

import Link from "next/link";
import { FileSearch, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { FormDialog } from "@/components/shared/form-dialog";
import type { Movement } from "@/types/movement";

export interface MissingChitRow {
  movement: Movement;
  missing: ("Loading Chit" | "Discharge Chit")[];
}

export function MissingChitsDialog({
  open,
  onOpenChange,
  rows,
  canUpload,
  onSubmit,
  onViewDocuments,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: MissingChitRow[];
  canUpload: boolean;
  onSubmit: () => void;
  onViewDocuments: (movementId: string) => void;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title="Movements awaiting chits"
      description={`${rows.length} movement(s) are missing a loading and/or discharge chit.`}
    >
      {rows.length === 0 ? (
        <EmptyState title="Nothing missing" description="Every dispatched movement has both chits." />
      ) : (
        <div className="divide-y rounded-lg border">
          {rows.map(({ movement: m, missing }) => (
            <div key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <Link href={`/movements/${m.id}`} className="font-medium text-brand hover:underline">{m.id}</Link>
                <span className="ml-2 text-xs text-slate">{m.status}</span>
                <div className="truncate text-xs text-slate">
                  {m.containerNos.join(" / ")} · {m.sourceTerminal} → {m.destinationTerminal}
                </div>
              </div>
              <div className="flex gap-1">
                {missing.map((t) => (
                  <Badge key={t} variant="outline" className="border-danger/30 text-danger">Missing {t === "Loading Chit" ? "loading" : "discharge"} chit</Badge>
                ))}
              </div>
              <div className="flex gap-1.5">
                <Button size="xs" variant="outline" onClick={() => onViewDocuments(m.id)}>
                  <FileSearch /> Documents
                </Button>
                {canUpload && (
                  <Button size="xs" onClick={onSubmit}>
                    <Upload /> Submit chits
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </FormDialog>
  );
}
