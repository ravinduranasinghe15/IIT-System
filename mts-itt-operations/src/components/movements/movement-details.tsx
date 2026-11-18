"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, FileText, Lock, Pencil, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard, KeyValue } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DocumentPreview } from "@/components/evidence/document-preview";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useLookups } from "@/hooks/use-lookups";
import { useMovements } from "@/hooks/use-movements";
import { billableStatus } from "@/lib/eligibility";
import { BillingReadiness } from "./billing-readiness";
import { formatDateTime, minutesBetween } from "@/lib/date-utils";
import { ASSUMPTION_NOTE } from "@/lib/constants";
import { unitsFor } from "@/lib/eligibility";
import type { Movement } from "@/types/movement";
import { MovementEditDialog } from "./movement-edit-dialog";

interface TimelineItem {
  at: string;
  by: string;
  tag: string;
  text: string;
}

function Timeline({ items, empty }: { items: TimelineItem[]; empty: string }) {
  if (!items.length) return <EmptyState title={empty} />;
  return (
    <ol className="relative space-y-3 border-l pl-4">
      {items.map((e, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-background bg-brand" />
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate">
            <span className="font-medium text-ink">{e.tag}</span>
            <span>{formatDateTime(e.at)}</span>
            <span>· {e.by}</span>
          </div>
          <div className="text-sm text-ink">{e.text}</div>
        </li>
      ))}
    </ol>
  );
}

export function MovementDetails() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { db } = useApp();
  const { can, canSeeFinancials, isDriver } = useAuth();
  const { getById, approve } = useMovements();
  const lk = useLookups();
  const [editing, setEditing] = useState<Movement | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);

  const m = getById(id);

  if (!m) {
    const exists = db.movements.some((x) => x.id === id);
    return (
      <EmptyState
        icon={exists && isDriver ? Lock : FileText}
        title={exists ? "Not available for your role" : "Movement not found"}
        description={exists ? "Driver users can only view their own movements." : `No movement with ID ${id} exists in the demo data.`}
        action={
          <Button variant="outline" render={<Link href="/movements" />}>
            Back to movements
          </Button>
        }
      />
    );
  }

  const billable = billableStatus(m, db);
  const exceptions = db.exceptions.filter((e) => e.movementId === m.id);
  const docs = db.documents.filter((d) => d.movementId === m.id);
  const pm = lk.primeMover(m.primeMoverId);
  const trailer = lk.trailer(m.trailerId);
  const driver = lk.driver(m.driverId);
  const srcT = db.terminals.find((t) => t.code === m.sourceTerminal);
  const dstT = db.terminals.find((t) => t.code === m.destinationTerminal);
  const transit = m.loadingAt && m.dischargeAt ? minutesBetween(m.loadingAt, m.dischargeAt) : null;

  const events: TimelineItem[] = [...m.events].sort((a, b) => (a.at < b.at ? -1 : 1)).map((e) => ({ at: e.at, by: e.by, tag: e.kind, text: e.text }));
  const reconciliation = events.filter((e) => ["reconciliation", "import", "approval"].includes(e.tag));
  const auditEntries: TimelineItem[] = db.audit
    .filter((a) => a.entityId === m.id)
    .map((a) => ({ at: a.at, by: `${a.userName} (${a.role})`, tag: a.action, text: a.description }));
  const trail = [...events, ...auditEntries].sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div>
      <PageHeader
        title={`Movement ${m.id}`}
        description={`${m.containerNos.join(" + ")} · ${m.sourceTerminal} → ${m.destinationTerminal} · ${m.origin === "Import" ? `Imported (${m.importId ?? "—"})` : m.origin === "Seed" ? "Historical record" : "Manual entry"}`}
        badge={
          <>
            <StatusBadge status={m.status} />
            {canSeeFinancials && <StatusBadge status={billable} />}
          </>
        }
        actions={
          <>
            <Button variant="outline" render={<Link href="/movements" />}>
              <ArrowLeft /> Back
            </Button>
            {can("movement.approve") && m.pendingApproval && (
              <Button onClick={() => setConfirmApprove(true)}>
                <CheckCircle2 /> Approve correction
              </Button>
            )}
            {can("movement.edit") && (
              <Button variant="outline" onClick={() => setEditing(m)}>
                <Pencil /> Edit
              </Button>
            )}
          </>
        }
      />

      {m.pendingApproval && (
        <div className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          <div>
            A financially material correction on this movement is awaiting manager approval. It remains blocked for billing and pay until approved.
          </div>
        </div>
      )}

      {canSeeFinancials && <BillingReadiness movement={m} />}

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Movement information" className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <KeyValue label="Movement ID">{m.id}</KeyValue>
            <KeyValue label="Status">
              <StatusBadge status={m.status} />
            </KeyValue>
            {canSeeFinancials && (
              <KeyValue label="Billable status">
                <StatusBadge status={billable} />
              </KeyValue>
            )}
            <KeyValue label="Route">
              {m.sourceTerminal} → {m.destinationTerminal}
            </KeyValue>
            <KeyValue label="Origin">{m.origin}</KeyValue>
            <KeyValue label="Registered">
              {formatDateTime(m.createdAt)} by {m.createdBy}
            </KeyValue>
            <KeyValue label="Last updated">{formatDateTime(m.updatedAt)}</KeyValue>
            <KeyValue label="Transit time">{transit === null ? "—" : transit < 0 ? "Invalid (discharge before loading)" : `${Math.floor(transit / 60)} h ${transit % 60} min`}</KeyValue>
            <KeyValue label="Notes">{m.notes || "—"}</KeyValue>
          </dl>
        </SectionCard>

        <SectionCard title="Container information">
          <dl className="space-y-3">
            <KeyValue label="Size">{m.containerSize}</KeyValue>
            <KeyValue label="Container number(s)">
              {m.containerNos.map((c) => (
                <div key={c} className="font-mono text-sm">
                  {c}
                </div>
              ))}
            </KeyValue>
            <KeyValue label="Journey vs units">
              <b>1</b> journey · <b>{m.containerNos.length}</b> container unit{m.containerNos.length === 1 ? "" : "s"}
              {canSeeFinancials && (
                <div className="mt-0.5 text-xs text-slate">
                  Billing units ({db.settings.billingUnitMode}): {unitsFor(m, db.settings.billingUnitMode)}. {ASSUMPTION_NOTE}
                </div>
              )}
            </KeyValue>
          </dl>
        </SectionCard>

        <SectionCard title="Truck, trailer & driver">
          <dl className="space-y-3">
            <KeyValue label="Prime mover">
              {pm ? (
                <Link href={`/fleet/${pm.id}`} className="text-brand hover:underline" onClick={(e) => isDriver && e.preventDefault()}>
                  {pm.id} · {pm.regNo}
                </Link>
              ) : (
                (m.primeMoverId ?? "Not recorded")
              )}
            </KeyValue>
            <KeyValue label="Trailer">{trailer ? `${trailer.id} · ${trailer.regNo} (${trailer.capacity})` : (m.trailerId ?? "Not recorded")}</KeyValue>
            <KeyValue label="Driver">
              {driver ? (
                isDriver ? (
                  `${driver.name} (${driver.id})`
                ) : (
                  <Link href={`/drivers/${driver.id}`} className="text-brand hover:underline">
                    {driver.name} ({driver.id})
                  </Link>
                )
              ) : (
                "Not recorded"
              )}
              {driver && m.driverSource && m.driverSource !== "manual" && (
                <span className="ml-2 text-xs text-slate">{m.driverSource === "driver log" ? "from verified driver log" : "from roster"}</span>
              )}
            </KeyValue>
          </dl>
        </SectionCard>

        <SectionCard title="Loading information">
          <dl className="space-y-3">
            <KeyValue label="Source terminal">
              {m.sourceTerminal}
              {srcT && <span className="text-slate"> – {srcT.name}</span>}
            </KeyValue>
            <KeyValue label="Loading time">{formatDateTime(m.loadingAt)}</KeyValue>
            <KeyValue label="Terminal status">{srcT ? <StatusBadge status={srcT.status} /> : "—"}</KeyValue>
            {srcT?.note && <div className="text-xs text-slate">{srcT.note}</div>}
          </dl>
        </SectionCard>

        <SectionCard title="Discharge information">
          <dl className="space-y-3">
            <KeyValue label="Destination terminal">
              {m.destinationTerminal}
              {dstT && <span className="text-slate"> – {dstT.name}</span>}
            </KeyValue>
            <KeyValue label="Discharge time">{formatDateTime(m.dischargeAt)}</KeyValue>
            <KeyValue label="Terminal status">{dstT ? <StatusBadge status={dstT.status} /> : "—"}</KeyValue>
            {(m.status === "Rejected" || m.status === "Damaged") && (
              <div className="rounded-md bg-red-50 p-2 text-xs text-red-800">Evidence and history for this {m.status.toLowerCase()} delivery are retained.</div>
            )}
          </dl>
        </SectionCard>
      </div>

      <Tabs defaultValue="documents" className="mt-4">
        <TabsList>
          <TabsTrigger value="documents">Documents ({docs.length})</TabsTrigger>
          <TabsTrigger value="reconciliation">Reconciliation</TabsTrigger>
          <TabsTrigger value="exceptions">Exceptions ({exceptions.length})</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
        </TabsList>
        <TabsContent value="documents">
          <SectionCard
            title="Attached chits & documents"
            actions={
              can("evidence.upload") && (
                <Button size="sm" variant="outline" render={<Link href={`/evidence?movement=${m.id}`} />}>
                  Manage in Evidence
                </Button>
              )
            }
          >
            {docs.length === 0 ? (
              <EmptyState icon={FileText} title="No documents attached" description="Loading and discharge chits attached to this movement will appear here." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {docs.map((d) => (
                  <div key={d.id} className="rounded-lg border p-3">
                    <div className="mb-2 flex items-center justify-between gap-2 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-ink">{d.docType}</div>
                        <div className="truncate text-xs text-slate">
                          {d.id} · {d.name} · {formatDateTime(d.uploadedAt)} · {d.uploadedBy}
                        </div>
                      </div>
                      <Button size="xs" variant="outline" render={<Link href={`/evidence?doc=${d.id}`} />}>
                        Open
                      </Button>
                    </div>
                    <DocumentPreview doc={d} className="max-h-72" />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>
        <TabsContent value="reconciliation">
          <SectionCard title="Reconciliation history" description="Automatic checks, imports and approvals for this movement">
            <Timeline items={reconciliation} empty="No reconciliation events" />
          </SectionCard>
        </TabsContent>
        <TabsContent value="exceptions">
          <SectionCard title="Exception history" bodyClassName="p-0">
            {exceptions.length === 0 ? (
              <EmptyState title="No exceptions" description="Reconciliation found no discrepancies for this movement." />
            ) : (
              <ul className="divide-y">
                {exceptions.map((e) => (
                  <li key={e.id}>
                    <Link href={`/exceptions/${e.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 hover:bg-muted/50">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-ink">
                          {e.id} · {e.type}
                        </div>
                        <div className="text-xs text-slate">
                          Reported {formatDateTime(e.reportedAt)}
                          {e.resolvedAt ? ` · closed ${formatDateTime(e.resolvedAt)}` : ""}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <StatusBadge status={e.priority} />
                        <StatusBadge status={e.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>
        <TabsContent value="audit">
          <SectionCard title="Audit trail" description="Movement events and audit-log entries, newest first">
            <Timeline items={trail} empty="No audit entries" />
          </SectionCard>
        </TabsContent>
      </Tabs>

      <MovementEditDialog movement={editing} onOpenChange={(o) => !o && setEditing(null)} />
      <ConfirmDialog
        open={confirmApprove}
        onOpenChange={setConfirmApprove}
        title={`Approve correction on ${m.id}?`}
        description="This releases the billing/pay hold for the financially material correction. The approval is recorded in the audit log (demo simulation)."
        confirmLabel="Approve correction"
        onConfirm={() => {
          if (approve(m.id, "Approved from movement detail.")) toast.success(`Correction on ${m.id} approved`);
          else toast.error("Nothing to approve");
        }}
      />
    </div>
  );
}
