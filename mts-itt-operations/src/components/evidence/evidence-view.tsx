"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { FileCheck2, FileQuestion, FileStack, Link2Off, ScanText, Upload, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard } from "@/components/shared/section-card";
import { StatCard } from "@/components/shared/stat-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { DocumentDetailDialog, ocrState } from "./document-detail";
import { DocumentList, EMPTY_FILTERS, type DocFilters } from "./document-list";
import { ChitSubmitDialog } from "./chit-submit-dialog";
import { OcrDisclaimer } from "./ocr-review";
import { movementsCovered } from "@/lib/driver-logs";
import { MissingChitsDialog, type MissingChitRow } from "./missing-chits-dialog";

export function EvidenceView() {
  const { db } = useApp();
  const { can, isDriver } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const docParam = params.get("doc");
  const movementParam = params.get("movement");
  const [filters, setFilters] = useState<DocFilters>(EMPTY_FILTERS);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [missingOpen, setMissingOpen] = useState(false);

  const canUpload = can("evidence.upload");
  const movement = movementParam ? db.movements.find((m) => m.id === movementParam) : undefined;
  const selected = docParam ? (db.documents.find((d) => d.id === docParam) ?? null) : null;

  const docs = useMemo(
    () => (movementParam ? db.documents.filter((d) => d.movementId === movementParam || movementsCovered(db, d).some((m) => m.id === movementParam)) : db.documents),
    [db, movementParam],
  );

  const stats = useMemo(() => {
        const chitsByMovement = new Map<string, Set<string>>();
    for (const d of db.documents) {
      if (!d.movementId) continue;
      const set = chitsByMovement.get(d.movementId) ?? new Set<string>();
      set.add(d.docType);
      chitsByMovement.set(d.movementId, set);
    }
    const missing: MissingChitRow[] = [];
    for (const m of db.movements) {
      if (m.status === "Pending") continue; // not yet dispatched – chits aren't due
      const set = chitsByMovement.get(m.id);
      const gaps = (["Loading Chit", "Discharge Chit"] as const).filter((t) => !set?.has(t));
      if (gaps.length) missing.push({ movement: m, missing: [...gaps] });
    }
    return {
      total: db.documents.length,
      unlinked: db.documents.filter((d) => !d.movementId && !movementsCovered(db, d).length).length,
      awaiting: db.documents.filter((d) => ocrState(d) === "Needs Verification").length,
      verified: db.documents.filter((d) => ocrState(d) === "Verified").length,
      missing,
    };
  }, [db.documents, db.movements]);

  const buildUrl = (next: { doc?: string | null; movement?: string | null }) => {
    const sp = new URLSearchParams();
    const mv = next.movement === undefined ? movementParam : next.movement;
    if (mv) sp.set("movement", mv);
    if (next.doc) sp.set("doc", next.doc);
    const qs = sp.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  if (isDriver) {
    return (
      <div className="rounded-xl border bg-card py-6 shadow-sm">
        <EmptyState title="Evidence is not available for the driver role" description="Chit evidence is managed by operations and supervisors." />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Chits & Evidence"
        description="Loading / discharge chits, driver log sheets and fuel invoices with full document history. Assisted extraction is a simulated pilot that always needs human verification."
        actions={
          canUpload ? (
            <Button onClick={() => setUploadOpen(true)}>
              <Upload /> Submit chits
            </Button>
          ) : (
            <Button disabled title="Your role cannot upload documents">
              <Upload /> Submit chits
            </Button>
          )
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatCard label="Documents" value={stats.total} icon={FileStack} tone="navy" />
        <StatCard label="Unlinked" value={stats.unlinked} icon={Link2Off} tone="orange" hint="Not tied to a movement" />
        <StatCard label="Awaiting verification" value={stats.awaiting} icon={ScanText} tone="orange" hint="Extraction needs a human check" />
        <StatCard label="Verified extractions" value={stats.verified} icon={FileCheck2} tone="green" />
        <StatCard
          label="Movements awaiting chits"
          value={stats.missing.length}
          icon={FileQuestion}
          tone="red"
          hint="Loading and/or discharge chit not yet submitted"
          action={<Button size="xs" variant="outline" onClick={() => setMissingOpen(true)}>View</Button>}
        />
      </div>

      <div className="mt-4 space-y-4">
        <OcrDisclaimer />

        {movementParam && (
          <Alert className="flex flex-wrap items-center gap-2">
            <AlertTitle className="col-span-2 flex flex-wrap items-center gap-2">
              Showing documents for{" "}
              {movement ? (
                <Link href={`/movements/${movement.id}`} className="font-semibold text-brand hover:underline">{movement.id}</Link>
              ) : (
                <span className="font-semibold">{movementParam}</span>
              )}
              {movement && <StatusBadge status={movement.status} />}
            </AlertTitle>
            <AlertDescription className="col-span-2 flex flex-wrap items-center gap-2">
              {movement ? `${movement.containerNos.join(" / ")} · ${movement.sourceTerminal} → ${movement.destinationTerminal}` : "No movement with this ID exists."}
              {canUpload && movement && (
                <Button size="xs" onClick={() => setUploadOpen(true)}>
                  <Upload /> Submit chits
                </Button>
              )}
              <Button size="xs" variant="outline" onClick={() => router.replace(buildUrl({ movement: null, doc: docParam }))}>
                <X /> Show all documents
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {docParam && !selected && (
          <Alert variant="destructive">
            <AlertTitle>Document {docParam} was not found</AlertTitle>
            <AlertDescription>It may have been removed by resetting the demo data.</AlertDescription>
          </Alert>
        )}

        <SectionCard title="Document register" bodyClassName="p-0">
          <DocumentList
            docs={docs}
            filters={filters}
            onFilters={setFilters}
            fixedMovementId={movementParam ?? undefined}
            onOpen={(d) => router.push(buildUrl({ doc: d.id }), { scroll: false })}
          />
        </SectionCard>
      </div>

      <DocumentDetailDialog key={selected?.id ?? "none"} doc={selected} onClose={() => router.replace(buildUrl({ doc: null }), { scroll: false })} />
      <MissingChitsDialog
        open={missingOpen}
        onOpenChange={setMissingOpen}
        rows={stats.missing}
        canUpload={canUpload}
        onSubmit={() => {
          setMissingOpen(false);
          setUploadOpen(true);
        }}
        onViewDocuments={(id) => {
          setMissingOpen(false);
          router.push(buildUrl({ movement: id, doc: null }), { scroll: false });
        }}
      />
      <ChitSubmitDialog open={uploadOpen} onOpenChange={setUploadOpen} onReview={(id) => router.push(buildUrl({ doc: id }), { scroll: false })} />
    </>
  );
}
