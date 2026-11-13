"use client";

import { useMemo } from "react";
import { useApp } from "@/contexts/app-context";

/** Cheap id → label lookups shared by tables and detail views. */
export function useLookups() {
  const { db } = useApp();
  return useMemo(() => {
    const drivers = new Map(db.drivers.map((d) => [d.id, d]));
    const movers = new Map(db.primeMovers.map((p) => [p.id, p]));
    const trailers = new Map(db.trailers.map((t) => [t.id, t]));
    return {
      driver: (id: string | null | undefined) => (id ? drivers.get(id) : undefined),
      driverName: (id: string | null | undefined) => (id ? (drivers.get(id)?.name ?? id) : "—"),
      primeMover: (id: string | null | undefined) => (id ? movers.get(id) : undefined),
      pmLabel: (id: string | null | undefined) => (id ? (movers.get(id) ? `${id}` : id) : "—"),
      pmReg: (id: string | null | undefined) => (id ? (movers.get(id)?.regNo ?? id) : "—"),
      trailer: (id: string | null | undefined) => (id ? trailers.get(id) : undefined),
      trailerLabel: (id: string | null | undefined) => (id ? id : "—"),
    };
  }, [db.drivers, db.primeMovers, db.trailers]);
}
