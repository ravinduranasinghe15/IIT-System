"use client";

import { FileText } from "lucide-react";
import type { EvidenceDoc } from "@/types/evidence";
import type { Movement } from "@/types/movement";
import { useApp } from "@/contexts/app-context";
import { formatDateTime } from "@/lib/date-utils";
import { cn } from "@/lib/utils";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Generates a clearly-labelled SAMPLE chit image for seeded documents (no real scans are shipped with the demo). */
export function chitSvgDataUrl(doc: EvidenceDoc, m?: Movement | null, driverName?: string): string {
  const title =
    doc.docType === "Loading Chit"
      ? "LOADING CHIT"
      : doc.docType === "Discharge Chit"
        ? "DISCHARGE CHIT"
        : doc.docType === "Fuel Invoice"
          ? "FUEL STATION INVOICE"
          : doc.docType === "Driver Log Sheet"
            ? "DRIVER LOG SHEET"
            : "SUPPORTING DOCUMENT";
  const rows: [string, string][] = m
    ? [
        ["Movement", m.id],
        ["Container(s)", m.containerNos.join(" / ")],
        ["Size", m.containerSize.replace("FT", " ft")],
        ["From", m.sourceTerminal],
        ["To", m.destinationTerminal],
        ["Truck", m.primeMoverId ?? "—"],
        ["Trailer", m.trailerId ?? "—"],
        ["Driver", driverName ?? m.driverId ?? "—"],
        [doc.docType === "Discharge Chit" ? "Discharged" : "Loaded", formatDateTime(doc.docType === "Discharge Chit" ? m.dischargeAt : m.loadingAt)],
      ]
    : [
        ["Document", doc.name],
        ["Uploaded", formatDateTime(doc.uploadedAt)],
        ["By", doc.uploadedBy],
      ];
  const body = rows
    .map(
      ([k, v], i) =>
        `<text x="34" y="${132 + i * 34}" font-size="13" fill="#64748B" font-family="Arial">${esc(k)}</text><text x="170" y="${132 + i * 34}" font-size="15" fill="#1E293B" font-family="Courier New, monospace" font-weight="bold">${esc(v)}</text><line x1="34" y1="${140 + i * 34}" x2="386" y2="${140 + i * 34}" stroke="#CBD5E1" stroke-dasharray="3 3"/>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="${190 + rows.length * 34 + 70}" viewBox="0 0 420 ${190 + rows.length * 34 + 70}"><rect width="100%" height="100%" fill="#FBFAF4"/><rect x="10" y="10" width="400" height="${170 + rows.length * 34 + 50}" fill="none" stroke="#315D8A" stroke-width="2"/><text x="210" y="42" text-anchor="middle" font-size="12" fill="#315D8A" font-family="Arial" font-weight="bold">MARINE TRANSPORT SERVICES (PVT) LTD</text><text x="210" y="70" text-anchor="middle" font-size="20" fill="#142C4C" font-family="Arial" font-weight="bold">${title}</text><text x="210" y="92" text-anchor="middle" font-size="11" fill="#64748B" font-family="Arial">Chit ref: ${esc(doc.id)}</text><line x1="34" y1="104" x2="386" y2="104" stroke="#142C4C"/>${body}<path d="M60 ${200 + rows.length * 34} q20 -30 40 0 t40 0 t40 -10" stroke="#203E65" fill="none" stroke-width="2"/><text x="34" y="${222 + rows.length * 34}" font-size="11" fill="#64748B" font-family="Arial">Supervisor signature</text><text x="210" y="${250 + rows.length * 34}" text-anchor="middle" font-size="10" fill="#DC2626" font-family="Arial">SAMPLE DEMO DOCUMENT – NOT A REAL SCAN</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Preview of an evidence document: uploaded image/PDF, or a generated sample chit for seeded documents. */
export function DocumentPreview({ doc, className }: { doc: EvidenceDoc; className?: string }) {
  const { db } = useApp();
  const m = doc.movementId ? db.movements.find((x) => x.id === doc.movementId) : null;
  const driver = m?.driverId ? db.drivers.find((d) => d.id === m.driverId)?.name : undefined;

  if (doc.dataUrl && doc.mime === "application/pdf") {
    return <iframe title={doc.name} src={doc.dataUrl} className={cn("h-[28rem] w-full rounded-lg border bg-white", className)} />;
  }
  if (doc.mime === "application/pdf" && !doc.dataUrl) {
    return (
      <div className={cn("flex h-64 flex-col items-center justify-center gap-2 rounded-lg border bg-muted/40 text-center text-sm text-slate", className)}>
        <FileText className="size-8" />
        PDF preview is only available in the session it was uploaded in (file too large to store in browser demo storage).
      </div>
    );
  }
  const src = doc.dataUrl ?? chitSvgDataUrl(doc, m, driver);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={`${doc.docType} ${doc.name}`} className={cn("mx-auto max-h-[32rem] rounded-lg border bg-white object-contain", className)} />
  );
}
