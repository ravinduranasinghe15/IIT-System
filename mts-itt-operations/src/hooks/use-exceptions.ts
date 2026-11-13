"use client";

import { useCallback, useMemo } from "react";
import { useApp } from "@/contexts/app-context";
import {
  addComment,
  approveException,
  assignException,
  correctMovementFromException,
  rejectException,
  resolveException,
  startReview,
} from "@/lib/mutations/exception";
import { approveMovementCorrection, runEvidenceReconciliation, type MovementInput } from "@/lib/mutations/movement";
import type { ExceptionRecord } from "@/types/exception";

export interface ExceptionFilters {
  search: string;
  type: string;
  priority: string;
  status: string;
  terminal: string;
  assignee: string;
}

export const EMPTY_EXCEPTION_FILTERS: ExceptionFilters = { search: "", type: "", priority: "", status: "", terminal: "", assignee: "" };

export function filterExceptions(list: ExceptionRecord[], f: ExceptionFilters): ExceptionRecord[] {
  const q = f.search.trim().toLowerCase();
  return list.filter((e) => {
    if (q && !(e.id.toLowerCase().includes(q) || e.movementId.toLowerCase().includes(q) || e.containerNo.toLowerCase().includes(q))) return false;
    if (f.type && e.type !== f.type) return false;
    if (f.priority && e.priority !== f.priority) return false;
    if (f.status === "__pending" ? !(e.status === "Open" || e.status === "Under Review") : f.status && e.status !== f.status) return false;
    if (f.terminal && e.sourceTerminal !== f.terminal) return false;
    if (f.assignee === "__none" ? e.assignedTo !== null : f.assignee && e.assignedTo !== f.assignee) return false;
    return true;
  });
}

export function useExceptions() {
  const { db, update } = useApp();
  const exceptions = db.exceptions;

  const kpis = useMemo(
    () => ({
      total: exceptions.length,
      critical: exceptions.filter((e) => e.priority === "Critical" && (e.status === "Open" || e.status === "Under Review")).length,
      pending: exceptions.filter((e) => e.status === "Open" || e.status === "Under Review").length,
      resolved: exceptions.filter((e) => e.status === "Resolved").length,
      rejected: exceptions.filter((e) => e.status === "Rejected").length,
      awaitingApproval: exceptions.filter((e) => e.status === "Resolved" && e.materialCorrection && e.managerApproved === false).length,
    }),
    [exceptions],
  );

  const getById = useCallback((id: string) => exceptions.find((e) => e.id === id), [exceptions]);
  const assign = useCallback((id: string, who: string | null) => update((d) => assignException(d, id, who)), [update]);
  const review = useCallback((id: string) => update((d) => startReview(d, id)), [update]);
  const comment = useCallback((id: string, text: string) => update((d) => addComment(d, id, text)), [update]);
  const correct = useCallback((id: string, patch: Partial<MovementInput>, reason: string) => update((d) => correctMovementFromException(d, id, patch, reason)), [update]);
  const resolve = useCallback((id: string, note: string) => update((d) => resolveException(d, id, note)), [update]);
  const reject = useCallback((id: string, reason: string) => update((d) => rejectException(d, id, reason)), [update]);
  const approve = useCallback((id: string, note: string) => update((d) => approveException(d, id, note)), [update]);
  const approveMovement = useCallback((movementId: string, note: string) => update((d) => approveMovementCorrection(d, movementId, note)), [update]);
  const runReconciliation = useCallback(() => update((d) => runEvidenceReconciliation(d)), [update]);

  return { exceptions, kpis, getById, assign, review, comment, correct, resolve, reject, approve, approveMovement, runReconciliation };
}
