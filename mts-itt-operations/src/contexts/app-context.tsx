"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { DB } from "@/types/db";
import { DB_VERSION, createSeedDB } from "@/data/seed";

const STORAGE_KEY = "mts-itt-demo-db-v1";

interface AppCtx {
  /** null until the client has hydrated from localStorage (never read it during SSR) */
  db: DB | null;
  ready: boolean;
  /** Mutate a deep copy of the DB, persist and re-render. Returns whatever the mutator returns. */
  update: <T>(fn: (draft: DB) => T) => T;
  /** Wipe localStorage demo data and re-seed. */
  reset: () => void;
}

const Ctx = createContext<AppCtx | null>(null);

function loadDb(): DB {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DB;
      if (parsed.version === DB_VERSION) return parsed;
    }
  } catch {
    /* corrupted or blocked storage – fall through to seed */
  }
  const seed = createSeedDB();
  persist(seed);
  return seed;
}

let warned = false;
function persist(db: DB) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    if (!warned) {
      warned = true;
      toast.error("Browser storage is full or unavailable – demo changes will not survive a refresh.");
    }
  }
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<DB | null>(null);
  const ref = useRef<DB | null>(null);

  useEffect(() => {
    const loaded = loadDb();
    ref.current = loaded;
    // Hydrating from localStorage after mount is intentional (avoids SSR/hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDb(loaded);
  }, []);

  const update = useCallback(<T,>(fn: (draft: DB) => T): T => {
    const next = structuredClone(ref.current as DB);
    next.counters.tick = (next.counters.tick ?? 0) + 1;
    const result = fn(next);
    ref.current = next;
    setDb(next);
    persist(next);
    return result;
  }, []);

  const reset = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    const seed = createSeedDB();
    ref.current = seed;
    setDb(seed);
    persist(seed);
  }, []);

  const value = useMemo<AppCtx>(() => ({ db, ready: db !== null, update, reset }), [db, update, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppState(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAppState must be used inside <AppProvider>");
  return c;
}

/** The demo database. Only call from components rendered below <AppLayout> (which waits for hydration). */
export function useApp(): { db: DB; update: AppCtx["update"]; reset: () => void } {
  const { db, update, reset } = useAppState();
  if (!db) throw new Error("Demo database not ready");
  return { db, update, reset };
}
