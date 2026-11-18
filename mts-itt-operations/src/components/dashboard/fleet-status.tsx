"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/section-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLookups } from "@/hooks/use-lookups";
import type { FleetRow } from "@/lib/stats";
import { ScrollX } from "@/components/shared/scroll-x";

export function FleetStatus({ rows }: { rows: FleetRow[] }) {
  const lk = useLookups();
  return (
    <SectionCard
      title="Fleet status"
      description="Prime movers · journeys today and over the last 14 days"
      bodyClassName="p-0"
      actions={
        <Button variant="ghost" size="sm" render={<Link href="/fleet" />}>
          Fleet <ArrowRight />
        </Button>
      }
    >
      <ScrollX>
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/60 hover:bg-muted/60">
              {["Vehicle", "Reg No", "Driver today", "Status", "Today", "14 days"].map((h) => (
                <TableHead key={h} className="h-9 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="py-1.5 text-sm font-medium">
                  <Link href={`/fleet/${r.id}`} className="text-brand hover:underline">
                    {r.id}
                  </Link>
                </TableCell>
                <TableCell className="py-1.5 text-sm">{r.regNo}</TableCell>
                <TableCell className="whitespace-nowrap py-1.5 text-sm">{lk.driverName(r.driverId)}</TableCell>
                <TableCell className="py-1.5">
                  <StatusBadge status={r.status} />
                </TableCell>
                <TableCell className="py-1.5 text-sm">{r.movementsToday}</TableCell>
                <TableCell className="py-1.5 text-sm">{r.movementsWindow}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </ScrollX>
    </SectionCard>
  );
}
