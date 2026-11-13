"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, FileText, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";
import { SectionCard, KeyValue } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { DocumentPreview } from "@/components/evidence/document-preview";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useLookups } from "@/hooks/use-lookups";
import { useExceptions } from "@/hooks/use-exceptions";
import { billableStatus } from "@/lib/eligibility";
import { formatDateTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { ExceptionReview } from "./exception-review";

export function ExceptionDetails() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { db } = useApp();
  const { canSeeFinancials } = useAuth();
  const { getById } = useExceptions();
  const lk = useLookups();
  const e = getById(id);

  if (!e) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Exception not found"
        description={`No exception with ID ${id} exists in the demo data.`}
        action={
          <Button variant="outline" render={<Link href="/exceptions" />}>
            Back to exceptions
          </Button>
        }
      />
    );
  }

  const m = db.movements.find((x) => x.id === e.movementId);
  const docs = db.documents.filter((d) => d.movementId === e.movementId);
  const billable = m ? billableStatus(m, db) : null;
  const awaiting = e.status === "Resolved" && e.materialCorrection && e.managerApproved === false;
  const comments = [...e.comments].sort((a, b) => (a.at < b.at ? 1 : -1));
  const related = db.exceptions.filter((x) => x.movementId === e.movementId && x.id !== e.id);

  return (
    <div>
      <PageHeader
        title={`Exception ${e.id}`}
        description={`${e.type} · ${e.movementId} · ${e.containerNo}`}
        badge={
          <>
            <StatusBadge status={e.status} />
            <StatusBadge status={e.priority} />
          </>
        }
        actions={
          <Button variant="outline" render={<Link href="/exceptions" />}>
            <ArrowLeft /> Back
          </Button>
        }
      />

      {(e.status === "Open" || e.status === "Under Review") && (
        <div className="mb-4 flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          Billing and pay are blocked for {e.movementId} until this exception is resolved or rejected{e.materialCorrection ? " and any material correction is approved by a manager" : ""}.
        </div>
      )}
      {awaiting && (
        <div className="mb-4 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          Resolved by {e.resolvedBy}, but the financially material correction awaits manager approval – the movement remains blocked.
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <SectionCard title="Exception summary">
            <p className="mb-3 text-sm text-ink">{e.description}</p>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <KeyValue label="Type">{e.type}</KeyValue>
              <KeyValue label="Priority">
                <StatusBadge status={e.priority} />
              </KeyValue>
              <KeyValue label="Status">
                <StatusBadge status={e.status} />
              </KeyValue>
              <KeyValue label="Source terminal">{e.sourceTerminal}</KeyValue>
              <KeyValue label="Reported">{formatDateTime(e.reportedAt)}</KeyValue>
              <KeyValue label="Assigned to">{e.assignedTo ?? "Unassigned"}</KeyValue>
              <KeyValue label="Material correction">{e.materialCorrection ? "Yes – manager approval applies" : "No"}</KeyValue>
              {e.importId && (
                <KeyValue label="From import">
                  <Link href={`/terminal-imports/${e.importId}`} className="text-brand hover:underline">
                    {e.importId}
                  </Link>
                </KeyValue>
              )}
              {e.resolvedAt && (
                <KeyValue label={e.status === "Rejected" ? "Rejected" : "Resolved"}>
                  {formatDateTime(e.resolvedAt)} by {e.resolvedBy}
                </KeyValue>
              )}
              {e.resolutionNote && <KeyValue label="Resolution note">{e.resolutionNote}</KeyValue>}
              {e.rejectReason && <KeyValue label="Rejection reason">{e.rejectReason}</KeyValue>}
              {e.materialCorrection && e.managerApproved !== undefined && (
                <KeyValue label="Manager approval">
                  {e.managerApproved ? `Approved by ${e.managerApprovedBy} (${formatDateTime(e.managerApprovedAt)})` : "Pending"}
                </KeyValue>
              )}
            </dl>
          </SectionCard>

          <SectionCard title="Conflicting information" description="System record vs source terminal report / evidence" bodyClassName="p-0">
            {e.conflicts.length === 0 ? (
              <EmptyState title="No field-level conflicts recorded" description="This exception was raised from a rule check rather than a value mismatch." />
            ) : (
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/60 text-left text-xs uppercase tracking-wide text-slate">
                      <th className="px-4 py-2 font-semibold">Field</th>
                      <th className="px-4 py-2 font-semibold">System record</th>
                      <th className="px-4 py-2 font-semibold">Source terminal / evidence</th>
                      <th className="px-4 py-2 font-semibold">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {e.conflicts.map((c, i) => {
                      const same = c.systemValue === c.sourceValue;
                      return (
                        <tr key={i}>
                          <td className="px-4 py-2 font-medium text-ink">{c.field}</td>
                          <td className="px-4 py-2 font-mono text-xs">{c.systemValue}</td>
                          <td className={cn("px-4 py-2 font-mono text-xs", !same && "font-semibold text-danger")}>{c.sourceValue}</td>
                          <td className="px-4 py-2">
                            <StatusBadge status={same ? "OK" : "Invalid"} className={same ? "" : ""} />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Related movement"
            actions={
              m && (
                <Button size="sm" variant="outline" render={<Link href={`/movements/${m.id}`} />}>
                  Open movement
                </Button>
              )
            }
          >
            {!m ? (
              <EmptyState title="Movement not found" />
            ) : (
              <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-4">
                <KeyValue label="Movement">{m.id}</KeyValue>
                <KeyValue label="Status">
                  <StatusBadge status={m.status} />
                </KeyValue>
                {canSeeFinancials && billable && (
                  <KeyValue label="Billable status">
                    <StatusBadge status={billable} />
                  </KeyValue>
                )}
                <KeyValue label="Route">
                  {m.sourceTerminal} → {m.destinationTerminal}
                </KeyValue>
                <KeyValue label="Container(s)">
                  <span className="font-mono text-xs">{m.containerNos.join(" + ")}</span> ({m.containerSize})
                </KeyValue>
                <KeyValue label="Prime mover">{lk.pmReg(m.primeMoverId)}</KeyValue>
                <KeyValue label="Trailer">{lk.trailerLabel(m.trailerId)}</KeyValue>
                <KeyValue label="Driver">{lk.driverName(m.driverId)}</KeyValue>
                <KeyValue label="Loading">{formatDateTime(m.loadingAt)}</KeyValue>
                <KeyValue label="Discharge">{formatDateTime(m.dischargeAt)}</KeyValue>
                {m.pendingApproval && (
                  <KeyValue label="Approval">
                    <StatusBadge status="Pending Approval" />
                  </KeyValue>
                )}
              </dl>
            )}
            {related.length > 0 && (
              <div className="mt-3 border-t pt-3 text-xs text-slate">
                Other exceptions on this movement:{" "}
                {related.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && ", "}
                    <Link href={`/exceptions/${r.id}`} className="text-brand hover:underline">
                      {r.id}
                    </Link>{" "}
                    ({r.status})
                  </span>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Supporting documents"
            actions={
              <Button size="sm" variant="outline" render={<Link href={`/evidence?movement=${e.movementId}`} />}>
                Open in Evidence
              </Button>
            }
          >
            {docs.length === 0 ? (
              <EmptyState icon={FileText} title="No documents attached" description="Missing chits are a common cause of exceptions – upload them from Chits & Evidence." />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {docs.map((d) => (
                  <div key={d.id} className="rounded-lg border p-3">
                    <div className="mb-2 text-sm font-medium text-ink">
                      {d.docType} <span className="text-xs font-normal text-slate">· {d.id}</span>
                    </div>
                    <DocumentPreview doc={d} className="max-h-64" />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="space-y-4">
          <ExceptionReview exception={e} movement={m} />
          <SectionCard title={`Comments (${comments.length})`} bodyClassName="p-0">
            {comments.length === 0 ? (
              <EmptyState title="No comments yet" />
            ) : (
              <ul className="divide-y">
                {comments.map((c) => (
                  <li key={c.id} className="px-4 py-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-slate">
                      <span className="font-medium text-ink">{c.by}</span>
                      <span>{formatDateTime(c.at)}</span>
                    </div>
                    <div className="mt-0.5 text-sm text-ink">{c.text}</div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
