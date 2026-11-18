"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { SectionCard } from "@/components/shared/section-card";
import { useApp } from "@/contexts/app-context";
import { AUTO_VERIFIER_NAME, movementMismatches } from "@/lib/cross-check";
import { billableStatus, unresolvedExceptionsFor } from "@/lib/eligibility";
import { logsFor, needsLog } from "@/lib/driver-logs";
import { cn } from "@/lib/utils";
import type { Movement } from "@/types/movement";

type Tone = "ok" | "wait" | "bad";

function Row({ tone, title, detail }: { tone: Tone; title: string; detail?: React.ReactNode }) {
  const Icon = tone === "ok" ? CheckCircle2 : tone === "bad" ? AlertTriangle : CircleDashed;
  return (
    <li className="flex gap-2.5 py-2 text-sm">
      <Icon className={cn("mt-0.5 size-4 shrink-0", tone === "ok" ? "text-success" : tone === "bad" ? "text-danger" : "text-slate")} />
      <div className="min-w-0">
        <div className="font-medium text-ink">{title}</div>
        {detail && <div className="text-xs text-slate">{detail}</div>}
      </div>
    </li>
  );
}

/** Why a movement is (not yet) Billable: the checklist the billing status is derived from, including the cross-check. */
export function BillingReadiness({ movement: m }: { movement: Movement }) {
  const { db } = useApp();
  const status = billableStatus(m, db);
  const chits = db.documents.filter((d) => d.movementId === m.id && (d.docType === "Loading Chit" || d.docType === "Discharge Chit"));
  const loading = chits.find((d) => d.docType === "Loading Chit");
  const discharge = chits.find((d) => d.docType === "Discharge Chit");
  const logs = logsFor(db, m);
  const logRequired = needsLog(m);
  const mismatches = movementMismatches(db, m);
  const open = unresolvedExceptionsFor(db, m.id);

  const chitRow = (label: string, d: typeof loading) =>
    !d ? <Row tone="wait" title={`${label} chit`} detail="Not submitted yet" />
    : d.ocr?.verified ? <Row tone="ok" title={`${label} chit verified`} detail={<>{d.id} · by {d.ocr.verifiedBy}</>} />
    : <Row tone="wait" title={`${label} chit waiting for verification`} detail={<>{d.id} · {d.ocr ? "needs a person to check it" : "not read yet"}</>} />;

  const verifiedLog = logs.find((l) => l.ocr?.verified);
  const reviewedBy = (docId: string) => {
    const d = db.documents.find((x) => x.id === docId);
    return d?.ocr?.verified && d.ocr.verifiedBy !== AUTO_VERIFIER_NAME ? d.ocr.verifiedBy : null;
  };

  return (
    <SectionCard
      title="Billing readiness"
      description={`Billing status: ${status}. Chits and the driver log are compared with the terminal data, the roster and each other before a movement can be billed.`}
      className="mb-4"
    >
      <ul className="divide-y">
        <Row tone={m.status === "Completed" ? "ok" : "wait"} title={m.status === "Completed" ? "Movement completed" : `Movement is ${m.status}`} detail={m.status === "Completed" ? undefined : "It completes when both chits are submitted"} />
        {chitRow("Loading", loading)}
        {chitRow("Discharge", discharge)}
        {!logRequired ? (
          <Row tone="ok" title="No driver log needed" detail="Historical record" />
        ) : verifiedLog ? (
          <Row tone="ok" title="Driver log verified" detail={<>{verifiedLog.id} · by {verifiedLog.ocr?.verifiedBy}</>} />
        ) : logs.length ? (
          <Row tone="wait" title="Driver log waiting for verification" detail={logs.map((l) => l.id).join(", ")} />
        ) : (
          <Row tone="wait" title="Driver log not received" detail={`Upload the sheet for ${m.primeMoverId ?? "this lorry"} in that shift under Driver Logs`} />
        )}
        {mismatches.length === 0 ? (
          <Row tone="ok" title="Cross-check passed" detail={chits.length || logs.length ? "The documents agree with the terminal data, the roster and each other" : "Nothing to compare yet"} />
        ) : (
          <Row
            tone={mismatches.some((x) => !reviewedBy(x.docId)) ? "bad" : "wait"}
            title={`Cross-check: ${mismatches.length} mismatch${mismatches.length === 1 ? "" : "es"}`}
            detail={
              <ul className="mt-1 space-y-1">
                {mismatches.map((x, i) => {
                  const by = reviewedBy(x.docId);
                  return (
                    <li key={i}>
                      <Link href={`/evidence?doc=${x.docId}`} className="font-medium text-brand hover:underline">{x.docId}</Link> · {x.message}
                      {by ? <span className="ml-1 text-success">(reviewed by {by})</span> : <span className="ml-1 text-danger">(needs review)</span>}
                    </li>
                  );
                })}
              </ul>
            }
          />
        )}
        <Row tone={open.length ? "bad" : "ok"} title={open.length ? `${open.length} open exception(s)` : "No open exceptions"} detail={open.map((e) => `${e.id} ${e.type}`).join(", ") || undefined} />
      </ul>
    </SectionCard>
  );
}
