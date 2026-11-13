"use client";

import { useApp } from "@/contexts/app-context";
import { invoiceBreakdown } from "@/lib/invoice-calculator";
import { CLIENT_NAME, VENDOR_NAME } from "@/lib/constants";
import { formatDate, formatDateTime, formatMonth, monthRange } from "@/lib/date-utils";
import { formatMoney } from "@/lib/utils";
import type { Invoice } from "@/types/invoice";

/** Print rules: only the sheet is printed, chrome is hidden and scroll containers are released. */
const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  body * { visibility: hidden !important; }
  .invoice-sheet, .invoice-sheet * { visibility: visible !important; }
  .invoice-sheet { position: absolute !important; left: 0; top: 0; width: 100% !important; margin: 0 !important; box-shadow: none !important; border: 0 !important; }
  *:has(.invoice-sheet) { overflow: visible !important; height: auto !important; max-height: none !important; }
  .invoice-sheet tr { break-inside: avoid; }
}
`;

/** Printable A4-style invoice. Demo only – not a tax invoice. */
export function InvoicePreview({ invoice }: { invoice: Invoice }) {
  const { db } = useApp();
  const term = db.terminals.find((t) => t.code === invoice.terminal);
  const { byRoute, bySize } = invoiceBreakdown(invoice);
  const { from, to } = monthRange(invoice.month);
  const m = (n: number) => formatMoney(n, invoice.currency);
  const approved = invoice.status === "Approved" || invoice.status === "Exported";
  const approvedEvent = [...invoice.history].reverse().find((h) => h.action === "Approved");
  const th = "border-b border-slate-300 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-600";
  const td = "border-b border-slate-100 px-2 py-1 text-[11px]";

  return (
    <div className="scroll-thin overflow-x-auto rounded-xl bg-slate-200/70 p-3 sm:p-6">
      <style>{PRINT_CSS}</style>
      <div className="invoice-sheet relative mx-auto min-h-[1000px] w-[794px] max-w-none overflow-hidden bg-white p-10 text-slate-800 shadow-lg ring-1 ring-slate-300">
        {/* watermark */}
        <div className="pointer-events-none absolute inset-0 flex select-none items-center justify-center" aria-hidden>
          <div className="-rotate-30 whitespace-nowrap text-6xl font-bold tracking-wide text-slate-900/[0.06]">DEMO – not a tax invoice</div>
        </div>

        <div className="relative">
          <header className="flex items-start justify-between border-b-2 border-[#142C4C] pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-lg bg-[#142C4C] text-lg font-bold text-white">MTS</div>
              <div>
                <div className="text-base font-bold text-[#142C4C]">{CLIENT_NAME}</div>
                <div className="text-[11px] text-slate-500">Inter-Terminal Transport · Port of Colombo</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold tracking-wide text-[#142C4C]">INVOICE</div>
              <div className="text-xs font-semibold text-slate-700">{invoice.invoiceNo}</div>
              <div className={`mt-1 inline-block rounded px-2 py-0.5 text-[10px] font-bold uppercase ${approved ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                {approved ? invoice.status : `${invoice.status} – not approved`}
              </div>
            </div>
          </header>

          <section className="mt-5 grid grid-cols-3 gap-4 text-[11px]">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Billed to</div>
              <div className="mt-0.5 font-semibold">{term?.name ?? invoice.terminal}</div>
              <div className="text-slate-500">Terminal code {invoice.terminal}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Billing period</div>
              <div className="mt-0.5 font-semibold">{formatMonth(invoice.month)}</div>
              <div className="text-slate-500">{formatDate(from)} – {formatDate(to)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Document</div>
              <div className="mt-0.5">Created {formatDateTime(invoice.createdAt)}</div>
              <div className="text-slate-500">{approved && approvedEvent ? `Approved ${formatDate(approvedEvent.at)}` : "Awaiting manager approval"}</div>
            </div>
          </section>

          <section className="mt-5">
            <table className="w-full border-collapse">
              <thead>
                <tr><th className={th}>Route</th><th className={th}>Size</th><th className={`${th} text-right`}>Movements</th><th className={`${th} text-right`}>Units</th><th className={`${th} text-right`}>Base</th><th className={`${th} text-right`}>Diesel adj.</th><th className={`${th} text-right`}>Amount</th></tr>
              </thead>
              <tbody>
                {(() => {
                  const rows = new Map<string, { route: string; size: string; mv: number; units: number; base: number; diesel: number }>();
                  for (const l of invoice.lines) {
                    const k = `${l.route}|${l.containerSize}`;
                    const r = rows.get(k) ?? { route: l.route, size: l.containerSize, mv: 0, units: 0, base: 0, diesel: 0 };
                    r.mv += 1; r.units += l.units; r.base += l.baseAmount; r.diesel += l.dieselAmount;
                    rows.set(k, r);
                  }
                  return [...rows.values()].sort((a, b) => (a.route + a.size).localeCompare(b.route + b.size)).map((r) => (
                    <tr key={`${r.route}${r.size}`}>
                      <td className={td}>{r.route.replace("-", " → ")}</td><td className={td}>{r.size}</td>
                      <td className={`${td} text-right`}>{r.mv}</td><td className={`${td} text-right`}>{r.units}</td>
                      <td className={`${td} text-right`}>{m(r.base)}</td><td className={`${td} text-right`}>{m(r.diesel)}</td>
                      <td className={`${td} text-right font-medium`}>{m(r.base + r.diesel)}</td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </section>

          <section className="mt-4 flex justify-end">
            <table className="w-72 text-[12px]">
              <tbody>
                <tr><td className="py-1 text-slate-500">Base amount</td><td className="py-1 text-right">{m(invoice.baseAmount)}</td></tr>
                <tr><td className="py-1 text-slate-500">Diesel adjustment {invoice.dieselOverridePct !== null ? `(override ${invoice.dieselOverridePct}%)` : "(rate card)"}</td><td className="py-1 text-right">{m(invoice.dieselAmount)}</td></tr>
                <tr className="border-t-2 border-[#142C4C] text-sm font-bold text-[#142C4C]"><td className="py-1.5">Total ({invoice.currency})</td><td className="py-1.5 text-right">{m(invoice.finalAmount)}</td></tr>
              </tbody>
            </table>
          </section>

          <section className="mt-5 grid grid-cols-2 gap-4 text-[11px]">
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">By container size</div>
              {bySize.map((s) => (
                <div key={s.size} className="flex justify-between border-b border-slate-100 py-0.5"><span>{s.size} · {s.containers} containers · {s.movements} journeys</span><span>{m(s.base)}</span></div>
              ))}
            </div>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">By route</div>
              {byRoute.map((r) => (
                <div key={r.route} className="flex justify-between border-b border-slate-100 py-0.5"><span>{r.route.replace("-", " → ")} · {r.movements} journeys</span><span>{m(r.base)}</span></div>
              ))}
            </div>
          </section>

          <section className="mt-5">
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Movement schedule ({invoice.lines.length})</div>
            <table className="w-full border-collapse">
              <thead>
                <tr><th className={th}>Movement</th><th className={th}>Container(s)</th><th className={th}>Size</th><th className={th}>Route</th><th className={th}>Day</th><th className={`${th} text-right`}>Units</th><th className={`${th} text-right`}>Rate</th><th className={`${th} text-right`}>Diesel</th><th className={`${th} text-right`}>Total</th></tr>
              </thead>
              <tbody>
                {invoice.lines.map((l) => (
                  <tr key={l.movementId}>
                    <td className={td}>{l.movementId}</td><td className={td}>{l.containerNos.join(" / ")}</td><td className={td}>{l.containerSize}</td>
                    <td className={td}>{l.route.replace("-", " → ")}</td><td className={td}>{formatDate(l.movementDate)}</td>
                    <td className={`${td} text-right`}>{l.units}</td><td className={`${td} text-right`}>{m(l.rate)}</td>
                    <td className={`${td} text-right`}>{l.dieselPct}%</td><td className={`${td} text-right`}>{m(l.baseAmount + l.dieselAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <footer className="mt-8 border-t border-slate-300 pt-3 text-[10px] leading-relaxed text-slate-500">
            <p>
              DEMO – not a tax invoice. Generated by the MTS ITT Operations demonstration system ({VENDOR_NAME}). Amounts, rates and the diesel adjustment are configurable demo
              assumptions pending contractual confirmation. This document is not posted to any ERP or accounting system.
            </p>
            <p className="mt-1 font-medium text-slate-600">Prepared with {VENDOR_NAME} · MTS ITT Operations Management System</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
