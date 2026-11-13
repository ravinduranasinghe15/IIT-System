"use client";

import { useCallback, useMemo } from "react";
import { useApp } from "@/contexts/app-context";
import { useAuth } from "@/contexts/auth-context";
import { actorOf, logAudit, nextId, nowOf } from "@/lib/db-helpers";
import { billableStatus, movementDay } from "@/lib/eligibility";
import {
  approveMovementCorrection,
  createMovement,
  makeEvent,
  updateMovement,
  type MovementInput,
} from "@/lib/mutations/movement";
import type { DB } from "@/types/db";
import type { BillableStatus, Movement } from "@/types/movement";
import type { DocType, EvidenceDoc } from "@/types/evidence";

export interface MovementFilters {
  search: string;
  terminal: string;
  driver: string;
  truck: string;
  size: string;
  status: string;
  billable: string;
  from: string;
  to: string;
}

export const EMPTY_FILTERS: MovementFilters = {
  search: "",
  terminal: "",
  driver: "",
  truck: "",
  size: "",
  status: "",
  billable: "",
  from: "",
  to: "",
};

export interface MovementRow {
  movement: Movement;
  billable: BillableStatus;
  day: string | null;
}

export interface AttachmentInput {
  name: string;
  mime: string;
  sizeKb: number;
  docType: DocType;
  dataUrl?: string;
}

/** Max size stored inline in browser demo storage. */
export const MAX_INLINE_KB = 600;

export function filterRows(rows: MovementRow[], f: MovementFilters): MovementRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter(({ movement: m, billable, day }) => {
    if (q && !(m.id.toLowerCase().includes(q) || m.containerNos.some((c) => c.toLowerCase().includes(q)))) return false;
    if (f.terminal && m.sourceTerminal !== f.terminal && m.destinationTerminal !== f.terminal) return false;
    if (f.driver && m.driverId !== f.driver) return false;
    if (f.truck && m.primeMoverId !== f.truck) return false;
    if (f.size && m.containerSize !== f.size) return false;
    if (f.status && m.status !== f.status) return false;
    if (f.billable && billable !== f.billable) return false;
    if (f.from && (!day || day < f.from)) return false;
    if (f.to && (!day || day > f.to)) return false;
    return true;
  });
}

export function attachDocument(d: DB, movementId: string, att: AttachmentInput): EvidenceDoc {
  const actor = actorOf(d);
  const now = nowOf(d);
  const doc: EvidenceDoc = {
    id: nextId(d, "document", "DOC-", 4),
    name: att.name,
    docType: att.docType,
    mime: att.mime,
    sizeKb: att.sizeKb,
    uploadedAt: now,
    uploadedBy: actor.name,
    movementId,
    dataUrl: att.dataUrl,
    history: [{ at: now, by: actor.name, action: `Uploaded and attached to ${movementId}` }],
  };
  d.documents.unshift(doc);
  const m = d.movements.find((x) => x.id === movementId);
  if (m) m.events.push(makeEvent(d, "document", `${att.docType} "${att.name}" attached (${doc.id}).`));
  logAudit(d, { action: "Document Attached", module: "Evidence", description: `${doc.id} (${att.docType}) attached to ${movementId}.`, entityId: movementId });
  return doc;
}

/** Movement ledger access with driver scoping + thin mutation wrappers. */
export function useMovements() {
  const { db, update } = useApp();
  const { isDriver, driverId } = useAuth();

  const movements = useMemo(
    () => (isDriver ? db.movements.filter((m) => m.driverId === driverId) : db.movements),
    [db.movements, isDriver, driverId],
  );

  const rows = useMemo<MovementRow[]>(
    () =>
      movements.map((m) => ({
        movement: m,
        billable: billableStatus(m, db),
        day: movementDay(m, db.settings.opDayStartHour),
      })),
    [movements, db],
  );

  const create = useCallback(
    (input: MovementInput, attachment?: AttachmentInput) =>
      update((d) => {
        const m = createMovement(d, input);
        if (attachment) attachDocument(d, m.id, attachment);
        return m;
      }),
    [update],
  );

  const edit = useCallback(
    (id: string, patch: Partial<MovementInput>, reason: string) => update((d) => updateMovement(d, id, patch, reason)),
    [update],
  );

  const approve = useCallback((id: string, note: string) => update((d) => approveMovementCorrection(d, id, note)), [update]);

  const getById = useCallback((id: string) => movements.find((m) => m.id === id), [movements]);

  return { movements, rows, create, edit, approve, getById };
}
