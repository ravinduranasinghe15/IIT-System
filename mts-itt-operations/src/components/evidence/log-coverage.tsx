"use client";

import Link from "next/link";
import { useApp } from "@/contexts/app-context";
import { movementsCovered } from "@/lib/driver-logs";
import type { EvidenceDoc } from "@/types/evidence";

/** Driver log sheets cover several movements (by lorry/driver, date and shift) instead of one link. */
export function LogCoverage({ doc }: { doc: EvidenceDoc }) {
  const { db } = useApp();
  const covered = movementsCovered(db, doc);
  if (!covered.length) return <span className="text-amber-600">No movements covered</span>;
  return (
    <span className="flex flex-wrap gap-x-1.5 text-xs">
      {covered.slice(0, 3).map((m) => (
        <Link key={m.id} href={`/movements/${m.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-brand hover:underline">{m.id}</Link>
      ))}
      {covered.length > 3 && <span className="text-slate">+{covered.length - 3} more</span>}
    </span>
  );
}
