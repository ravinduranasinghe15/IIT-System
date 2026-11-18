import type { DB } from "@/types/db";
import type { Invoice, RateRecord } from "@/types/invoice";
import { calculateInvoice, type InvoiceCriteria } from "@/lib/invoice-calculator";
import { actorOf, logAudit, nextId, notify, nowOf } from "@/lib/db-helpers";
import { formatMonth } from "@/lib/date-utils";
import { can } from "@/lib/permissions";
import { formatMoney } from "@/lib/utils";
import type { ExportRow } from "@/lib/export-utils";
import type { MutationResult } from "./payment";

/* ------------------------------------------------------------------ invoices */

export function createInvoiceDraft(draft: DB, c: InvoiceCriteria): MutationResult<{ id: string }> {
  const actor = actorOf(draft);
  if (!can(actor.role, "invoice.manage")) return { ok: false, error: "Your role cannot create invoice drafts." };
  const calc = calculateInvoice(draft, c);
  if (calc.lines.length === 0) return { ok: false, error: "No eligible billable movements match these criteria." };
  const seq = draft.invoices.filter((i) => i.terminal === c.terminal && i.month === c.month).length + 1;
  const now = nowOf(draft);
  const id = nextId(draft, "invoice", "INV-", 4);
  const inv: Invoice = {
    id,
    invoiceNo: `MTS-${c.month.replace("-", "")}-${c.terminal}-${String(seq).padStart(3, "0")}`,
    terminal: c.terminal,
    month: c.month,
    routeFilter: c.route,
    sizeFilter: c.size,
    unitMode: draft.settings.billingUnitMode,
    currency: draft.settings.currency,
    status: "Draft",
    lines: calc.lines,
    dieselOverridePct: c.dieselOverridePct,
    baseAmount: calc.baseAmount,
    dieselAmount: calc.dieselAmount,
    finalAmount: calc.finalAmount,
    excluded: calc.excluded,
    createdAt: now,
    createdBy: actor.name,
    history: [
      {
        at: now,
        by: actor.name,
        action: "Draft created",
        note: `${calc.lines.length} movements, ${calc.excluded.length} excluded. Draft only - no ERP posting.`,
      },
    ],
  };
  draft.invoices.unshift(inv);
  logAudit(draft, {
    action: "Invoice Draft Created",
    module: "Invoicing",
    entityId: id,
    description: `Created ${inv.invoiceNo} for ${c.terminal} ${formatMonth(c.month)}: ${formatMoney(calc.finalAmount, inv.currency)}.`,
  });
  return { ok: true, id };
}

export function submitInvoice(draft: DB, id: string, note = ""): MutationResult {
  const actor = actorOf(draft);
  if (!can(actor.role, "invoice.manage")) return { ok: false, error: "Your role cannot submit invoices." };
  const inv = draft.invoices.find((i) => i.id === id);
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status !== "Draft") return { ok: false, error: "Only Draft invoices can be submitted." };
  inv.status = "Pending Approval";
  inv.history.push({ at: nowOf(draft), by: actor.name, action: "Submitted for approval", note: note.trim() });
  logAudit(draft, { action: "Invoice Submitted", module: "Invoicing", entityId: id, description: `${inv.invoiceNo} submitted for approval.` });
  notify(draft, {
    title: "Invoice awaiting approval",
    body: `${inv.invoiceNo} (${formatMoney(inv.finalAmount, inv.currency)}) needs an authorised manager.`,
    level: "info",
    href: `/invoicing/${id}`,
  });
  return { ok: true };
}

export function approveInvoice(draft: DB, id: string, note = ""): MutationResult {
  const actor = actorOf(draft);
  if (!can(actor.role, "invoice.approve")) return { ok: false, error: "Only the Manager can approve invoices." };
  const inv = draft.invoices.find((i) => i.id === id);
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status !== "Pending Approval") return { ok: false, error: "Only invoices pending approval can be approved." };
  inv.status = "Approved";
  inv.history.push({ at: nowOf(draft), by: actor.name, action: "Approved", note: note.trim() });
  logAudit(draft, {
    action: "Invoice Approved",
    module: "Invoicing",
    entityId: id,
    financial: true,
    description: `Approved ${inv.invoiceNo}, ${formatMoney(inv.finalAmount, inv.currency)} (simulated, no ERP posting).`,
  });
  notify(draft, { title: "Invoice approved", body: `${inv.invoiceNo} approved by ${actor.name}.`, level: "success", href: `/invoicing/${id}` });
  return { ok: true };
}

export function markInvoiceExported(draft: DB, id: string, note = "CSV export (manual hand-off, no ERP posting)."): MutationResult {
  const actor = actorOf(draft);
  if (!can(actor.role, "invoice.manage")) return { ok: false, error: "Your role cannot export invoices." };
  const inv = draft.invoices.find((i) => i.id === id);
  if (!inv) return { ok: false, error: "Invoice not found." };
  if (inv.status !== "Approved" && inv.status !== "Exported") return { ok: false, error: "Only approved invoices can be exported." };
  const first = inv.status === "Approved";
  inv.status = "Exported";
  inv.history.push({ at: nowOf(draft), by: actor.name, action: first ? "Exported" : "Re-exported", note });
  logAudit(draft, {
    action: first ? "Invoice Exported" : "Invoice Re-exported",
    module: "Invoicing",
    entityId: id,
    financial: true,
    description: `${inv.invoiceNo} exported as CSV.`,
  });
  return { ok: true };
}

export function deleteInvoiceDraft(draft: DB, id: string): MutationResult {
  const actor = actorOf(draft);
  if (!can(actor.role, "invoice.manage")) return { ok: false, error: "Your role cannot delete invoices." };
  const idx = draft.invoices.findIndex((i) => i.id === id);
  if (idx < 0) return { ok: false, error: "Invoice not found." };
  const inv = draft.invoices[idx];
  if (inv.status !== "Draft") return { ok: false, error: "Only Draft invoices can be deleted." };
  draft.invoices.splice(idx, 1);
  logAudit(draft, { action: "Invoice Draft Deleted", module: "Invoicing", entityId: id, description: `Deleted draft ${inv.invoiceNo}; its movements are billable again.` });
  return { ok: true };
}

export function invoiceCsvRows(inv: Invoice): ExportRow[] {
  return inv.lines.map((l) => ({
    "Invoice No": inv.invoiceNo,
    Terminal: inv.terminal,
    "Billing Month": inv.month,
    "Movement ID": l.movementId,
    "Container No(s)": l.containerNos.join(" / "),
    Size: l.containerSize,
    Route: l.route,
    "Movement Day": l.movementDate,
    Units: l.units,
    Rate: l.rate,
    "Base Amount": l.baseAmount,
    "Diesel %": l.dieselPct,
    "Diesel Amount": l.dieselAmount,
    "Line Total": Math.round((l.baseAmount + l.dieselAmount) * 100) / 100,
    Currency: inv.currency,
  }));
}

/* --------------------------------------------------------------------- rates */

export interface RateInput {
  source: RateRecord["source"];
  destination: RateRecord["destination"];
  containerSize: RateRecord["containerSize"];
  baseRate: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  dieselAdjustmentPct: number;
  status: RateRecord["status"];
}

/** Returns an error message when the rate is invalid or overlaps another Active window for route+size. */
export function validateRate(rates: RateRecord[], input: RateInput, ignoreId?: string): string | null {
  if (input.source === input.destination) return "Source and destination must differ.";
  if (!(input.baseRate > 0)) return "Base rate must be greater than zero.";
  if (input.dieselAdjustmentPct < 0 || input.dieselAdjustmentPct > 100) return "Diesel adjustment must be between 0 and 100%.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom)) return "Effective from date is required.";
  if (input.effectiveTo !== null && input.effectiveTo < input.effectiveFrom) return "Effective to cannot be before effective from.";
  if (input.status === "Active") {
    const clash = rates.find(
      (r) =>
        r.id !== ignoreId &&
        r.status === "Active" &&
        r.source === input.source &&
        r.destination === input.destination &&
        r.containerSize === input.containerSize &&
        r.effectiveFrom <= (input.effectiveTo ?? "9999-12-31") &&
        input.effectiveFrom <= (r.effectiveTo ?? "9999-12-31"),
    );
    if (clash) {
      return `Overlaps Active rate ${clash.id} (${clash.effectiveFrom} to ${clash.effectiveTo ?? "open"}) for ${input.source}-${input.destination} ${input.containerSize}. End-date or deactivate it first.`;
    }
  }
  return null;
}

export function addRate(draft: DB, input: RateInput): MutationResult<{ id: string }> {
  const actor = actorOf(draft);
  if (!can(actor.role, "rates.edit")) return { ok: false, error: "Your role cannot edit rates." };
  const err = validateRate(draft.rates, input);
  if (err) return { ok: false, error: err };
  const id = `RT-${String((draft.counters.rate ?? draft.rates.length) + 1).padStart(3, "0")}`;
  draft.counters.rate = (draft.counters.rate ?? draft.rates.length) + 1;
  draft.rates.push({ id, ...input });
  logAudit(draft, {
    action: "Rate Added",
    module: "Master Data",
    entityId: id,
    financial: true,
    description: `Added rate ${id}: ${input.source}-${input.destination} ${input.containerSize} ${formatMoney(input.baseRate, draft.settings.currency)} from ${input.effectiveFrom} (${input.status}).`,
  });
  return { ok: true, id };
}

export function updateRate(draft: DB, id: string, input: RateInput): MutationResult {
  const actor = actorOf(draft);
  if (!can(actor.role, "rates.edit")) return { ok: false, error: "Your role cannot edit rates." };
  const rate = draft.rates.find((r) => r.id === id);
  if (!rate) return { ok: false, error: "Rate not found." };
  const err = validateRate(draft.rates, input, id);
  if (err) return { ok: false, error: err };
  const before = `${formatMoney(rate.baseRate, draft.settings.currency)} ${rate.effectiveFrom}-${rate.effectiveTo ?? "open"} diesel ${rate.dieselAdjustmentPct}% ${rate.status}`;
  Object.assign(rate, input);
  logAudit(draft, {
    action: "Rate Updated",
    module: "Master Data",
    entityId: id,
    financial: true,
    description: `Updated rate ${id} (${input.source}-${input.destination} ${input.containerSize}). Was ${before}; now ${formatMoney(input.baseRate, draft.settings.currency)} ${input.effectiveFrom}-${input.effectiveTo ?? "open"} diesel ${input.dieselAdjustmentPct}% ${input.status}.`,
  });
  return { ok: true };
}

export function setRateStatus(draft: DB, id: string, status: RateRecord["status"]): MutationResult {
  const rate = draft.rates.find((r) => r.id === id);
  if (!rate) return { ok: false, error: "Rate not found." };
  const { id: _id, ...rest } = rate;
  void _id;
  const res = updateRate(draft, id, { ...rest, status });
  if (!res.ok) return res;
  return { ok: true };
}
