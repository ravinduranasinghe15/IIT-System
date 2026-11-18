"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLookups } from "@/hooks/use-lookups";
import { formatDateTime } from "@/lib/date-utils";
import type { Movement } from "@/types/movement";
import { ScrollX } from "@/components/shared/scroll-x";

export function RecentMovements({ movements, showDriver = true }: { movements: Movement[]; showDriver?: boolean }) {
  const lk = useLookups();
  const heads = ["Movement", "Container(s)", "Route", "Truck", ...(showDriver ? ["Driver"] : []), "Loaded", "Status"];
  return (
    <SectionCard
      title="Recent movements"
      description="Latest journeys in the ledger"
      bodyClassName="p-0"
      actions={
        <Button variant="ghost" size="sm" render={<Link href="/movements" />}>
          View all <ArrowRight />
        </Button>
      }
    >
      {movements.length === 0 ? (
        <EmptyState title="No movements yet" description="Registered and imported movements will appear here." />
      ) : (
        <ScrollX>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/60 hover:bg-muted/60">
                {heads.map((h) => (
                  <TableHead key={h} className="h-9 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate">
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="py-2 text-sm font-medium">
                    <Link href={`/movements/${m.id}`} className="text-brand hover:underline">
                      {m.id}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2 font-mono text-xs">
                    {m.containerNos.map((c) => (
                      <div key={c}>{c}</div>
                    ))}
                    <span className="font-sans text-[11px] text-slate">{m.containerSize}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap py-2 text-sm">
                    {m.sourceTerminal} → {m.destinationTerminal}
                  </TableCell>
                  <TableCell className="py-2 text-sm">{lk.pmLabel(m.primeMoverId)}</TableCell>
                  {showDriver && <TableCell className="whitespace-nowrap py-2 text-sm">{lk.driverName(m.driverId)}</TableCell>}
                  <TableCell className="whitespace-nowrap py-2 text-xs text-slate">{formatDateTime(m.loadingAt ?? m.dischargeAt)}</TableCell>
                  <TableCell className="py-2">
                    <StatusBadge status={m.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollX>
      )}
    </SectionCard>
  );
}
