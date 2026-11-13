"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ClipboardEdit, MessageSquarePlus, PlayCircle, ShieldCheck, UserPlus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SectionCard } from "@/components/shared/section-card";
import { NativeSelect } from "@/components/shared/native-select";
import { FormDialog } from "@/components/shared/form-dialog";
import { Field } from "@/components/shared/field";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { MovementForm } from "@/components/movements/movement-form";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { useExceptions } from "@/hooks/use-exceptions";
import { cn } from "@/lib/utils";
import type { ExceptionRecord } from "@/types/exception";
import type { Movement } from "@/types/movement";

const STEPS = ["Open", "Under Review", "Resolved / Rejected"];

function Stepper({ e }: { e: ExceptionRecord }) {
  const idx = e.status === "Open" ? 0 : e.status === "Under Review" ? 1 : 2;
  return (
    <ol className="flex items-center gap-1 text-xs">
      {STEPS.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-1">
          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold", i <= idx ? "bg-brand text-white" : "bg-slate-200 text-slate")}>{i + 1}</span>
          <span className={cn("truncate", i === idx ? "font-semibold text-ink" : "text-slate")}>{i === 2 && idx === 2 ? e.status : s}</span>
        </li>
      ))}
    </ol>
  );
}

type Dialog = null | "resolve" | "reject" | "correct" | "approve";

export function ExceptionReview({ exception: e, movement }: { exception: ExceptionRecord; movement: Movement | undefined }) {
  const { db } = useApp();
  const { can } = useAuth();
  const { assign, review, comment, correct, resolve, reject, approve, approveMovement } = useExceptions();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [newComment, setNewComment] = useState("");
  const [assignee, setAssignee] = useState(e.assignedTo ?? "");

  const canReview = can("exception.review");
  const canApprove = can("exception.approve");
  const closed = e.status === "Resolved" || e.status === "Rejected";
  const awaiting = e.status === "Resolved" && e.materialCorrection && e.managerApproved === false;
  const movementPending = !!movement?.pendingApproval;

  const reviewers = useMemo(
    () => db.users.filter((u) => u.status === "Active" && ["Administrator", "Operations Manager", "Supervisor"].includes(u.role)),
    [db.users],
  );

  const close = () => {
    setDialog(null);
    setText("");
    setErr(null);
  };

  const run = (r: { ok: true } | { ok: false; error: string }, okMsg: string) => {
    if (r.ok) toast.success(okMsg);
    else toast.error(r.error);
    return r.ok;
  };

  return (
    <div className="space-y-4">
      <SectionCard title="Workflow" description="Open → Under Review → Resolved / Rejected">
        <Stepper e={e} />
        {!canReview && <p className="mt-3 text-xs text-slate">Your role can view this exception but not change it.</p>}
        {canReview && (
          <div className="mt-4 space-y-3">
            {e.status === "Open" && (
              <Button
                className="w-full"
                onClick={() => run(review(e.id), `${e.id} moved to review`)}
              >
                <PlayCircle /> Start review
              </Button>
            )}
            {e.status === "Under Review" && (
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => setDialog("resolve")}>
                  <CheckCircle2 /> Resolve
                </Button>
                <Button variant="destructive" onClick={() => setDialog("reject")}>
                  <XCircle /> Reject
                </Button>
              </div>
            )}
            {!closed && movement && (
              <Button variant="outline" className="w-full" onClick={() => setDialog("correct")}>
                <ClipboardEdit /> Correct movement
              </Button>
            )}
            {e.materialCorrection && !closed && (
              <p className="text-xs text-amber-800">Financially material: a non-manager resolution is held for manager approval before the movement can become billable.</p>
            )}
          </div>
        )}
        {canApprove && (awaiting || movementPending) && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="text-sm font-medium text-amber-900">Manager approval required</div>
            <p className="mt-0.5 text-xs text-amber-800">
              {awaiting ? "This resolution changes financially material data." : "A correction on the related movement is pending approval."} Approving releases the billing hold.
            </p>
            <Button size="sm" className="mt-2" onClick={() => setDialog("approve")}>
              <ShieldCheck /> Approve
            </Button>
          </div>
        )}
        {!canApprove && (awaiting || movementPending) && <p className="mt-3 text-xs text-amber-800">Awaiting manager approval – billing remains blocked.</p>}
      </SectionCard>

      {canReview && !closed && (
        <SectionCard title="Assign reviewer">
          <div className="flex gap-2">
            <NativeSelect
              className="flex-1"
              value={assignee}
              onValueChange={setAssignee}
              placeholder="Unassigned"
              options={reviewers.map((u) => ({ value: u.name, label: `${u.name} · ${u.role}` }))}
              aria-label="Assign reviewer"
            />
            <Button
              variant="outline"
              disabled={(e.assignedTo ?? "") === assignee}
              onClick={() => run(assign(e.id, assignee || null), assignee ? `Assigned to ${assignee}` : "Assignment cleared")}
            >
              <UserPlus /> Assign
            </Button>
          </div>
        </SectionCard>
      )}

      {canReview && (
        <SectionCard title="Add comment">
          <Textarea value={newComment} onChange={(ev) => setNewComment(ev.target.value)} rows={2} placeholder="Add a review note…" />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={!newComment.trim()}
              onClick={() => {
                if (run(comment(e.id, newComment), "Comment added")) setNewComment("");
              }}
            >
              <MessageSquarePlus /> Post comment
            </Button>
          </div>
        </SectionCard>
      )}

      <FormDialog
        open={dialog === "resolve" || dialog === "reject"}
        onOpenChange={(o) => !o && close()}
        size="sm"
        title={dialog === "reject" ? `Reject ${e.id}` : `Resolve ${e.id}`}
        description={dialog === "reject" ? "Rejecting dismisses the exception as invalid. A reason is required and audit logged." : "Describe how the discrepancy was resolved. Recorded in the audit log."}
        footer={
          <>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              variant={dialog === "reject" ? "destructive" : "default"}
              onClick={() => {
                if (!text.trim()) {
                  setErr(dialog === "reject" ? "A rejection reason is required." : "A resolution note is required.");
                  return;
                }
                if (dialog === "reject") {
                  if (run(reject(e.id, text), `${e.id} rejected`)) close();
                } else {
                  const r = resolve(e.id, text);
                  if (r.ok) {
                    if (r.value.needsApproval) toast.warning(`${e.id} resolved – awaiting manager approval`, { description: "The movement stays blocked for billing until approved." });
                    else toast.success(`${e.id} resolved`);
                    close();
                  } else toast.error(r.error);
                }
              }}
            >
              {dialog === "reject" ? "Reject exception" : "Resolve exception"}
            </Button>
          </>
        }
      >
        <Field label={dialog === "reject" ? "Rejection reason" : "Resolution note"} required error={err ?? undefined}>
          <Textarea value={text} onChange={(ev) => setText(ev.target.value)} rows={4} autoFocus />
        </Field>
      </FormDialog>

      <FormDialog
        open={dialog === "correct"}
        onOpenChange={(o) => !o && close()}
        size="xl"
        title={`Correct ${e.movementId}`}
        description={`Correction made from ${e.id}. Recorded on the movement, the exception and the audit log.`}
        footer={
          <>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" form="exception-correct-form">
              Apply correction
            </Button>
          </>
        }
      >
        {movement && (
          <MovementForm
            formId="exception-correct-form"
            initial={movement}
            requireReason
            onSubmit={({ input, reason }) => {
              const r = correct(e.id, input, reason);
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              if (r.value.needsApproval) toast.warning("Correction applied – awaiting manager approval");
              else toast.success(`${e.movementId} corrected`, { description: `${r.value.changes.length} field(s) changed` });
              close();
            }}
          />
        )}
      </FormDialog>

      <ConfirmDialog
        open={dialog === "approve"}
        onOpenChange={(o) => !o && close()}
        title="Approve material correction?"
        description="This is a simulated manager approval of a financially material correction. It is recorded in the audit log and releases the billing hold."
        confirmLabel="Approve"
        onConfirm={() => {
          if (awaiting) {
            run(approve(e.id, ""), "Correction approved");
          } else if (movement && approveMovement(movement.id, `Approved via ${e.id}.`)) {
            toast.success("Correction approved");
          } else {
            toast.error("Nothing to approve");
          }
        }}
      />
    </div>
  );
}
