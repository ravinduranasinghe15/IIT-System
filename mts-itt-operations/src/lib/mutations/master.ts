import type { DB } from "@/types/db";
import type { ContainerSize, ContainerType, RouteRecord, Terminal, TerminalCode } from "@/types/terminal";
import type { PrimeMover, Trailer } from "@/types/vehicle";
import { logAudit } from "../db-helpers";

export type MutationResult = { ok: true; id?: string } | { ok: false; error: string };

const fail = (error: string): MutationResult => ({ ok: false, error });

/* ---------------------------------------------------------------- Terminals */

export type TerminalInput = Pick<Terminal, "name" | "role" | "status" | "note">;

export function saveTerminal(db: DB, code: TerminalCode, input: TerminalInput): MutationResult {
  const t = db.terminals.find((x) => x.code === code);
  if (!t) return fail(`Terminal ${code} not found.`);
  const changes: string[] = [];
  (Object.keys(input) as (keyof TerminalInput)[]).forEach((k) => {
    if (t[k] !== input[k]) changes.push(`${k}: "${t[k]}" → "${input[k]}"`);
  });
  if (!changes.length) return { ok: true, id: code };
  Object.assign(t, input);
  logAudit(db, { action: "Terminal Updated", module: "Master Data", entityId: code, description: `Terminal ${code} updated (${changes.join("; ")}).` });
  return { ok: true, id: code };
}

/* ------------------------------------------------------------------- Routes */

export type RouteInput = Pick<RouteRecord, "source" | "destination" | "code" | "description" | "status">;

export function deriveRouteCode(source: string, destination: string): string {
  return source && destination ? `${source}-${destination}` : "";
}

export function saveRoute(db: DB, input: RouteInput, editingId?: string): MutationResult {
  if (input.source === input.destination) return fail("Source and destination must be different terminals.");
  const dupPair = db.routes.find((r) => r.id !== editingId && r.source === input.source && r.destination === input.destination);
  if (dupPair) return fail(`A route for ${input.source} → ${input.destination} already exists (${dupPair.id}).`);
  const dupCode = db.routes.find((r) => r.id !== editingId && r.code.toLowerCase() === input.code.toLowerCase());
  if (dupCode) return fail(`Route code ${input.code} is already used by ${dupCode.id}.`);

  if (editingId) {
    const r = db.routes.find((x) => x.id === editingId);
    if (!r) return fail("Route not found.");
    const before = `${r.code} ${r.source}→${r.destination} [${r.status}]`;
    Object.assign(r, input);
    logAudit(db, { action: "Route Updated", module: "Master Data", entityId: r.id, description: `Route ${r.id} updated: ${before} → ${r.code} ${r.source}→${r.destination} [${r.status}].` });
    return { ok: true, id: r.id };
  }
  const n = db.routes.reduce((m, r) => Math.max(m, Number(r.id.replace(/\D/g, "")) || 0), 0) + 1;
  const id = `R-${String(n).padStart(3, "0")}`;
  db.routes.push({ id, ...input });
  logAudit(db, { action: "Route Created", module: "Master Data", entityId: id, description: `Route ${id} (${input.code}) created: ${input.source} → ${input.destination} [${input.status}].` });
  return { ok: true, id };
}

export function setRouteStatus(db: DB, id: string, status: RouteRecord["status"]): MutationResult {
  const r = db.routes.find((x) => x.id === id);
  if (!r) return fail("Route not found.");
  const prev = r.status;
  r.status = status;
  logAudit(db, { action: status === "Inactive" ? "Route Deactivated" : "Route Status Changed", module: "Master Data", entityId: id, description: `Route ${r.code} status ${prev} → ${status}.` });
  return { ok: true, id };
}

/* --------------------------------------------------------------- Containers */

export type ContainerTypeInput = Pick<ContainerType, "label" | "teu" | "maxPerJourney" | "status">;

export function saveContainerType(db: DB, size: ContainerSize, input: ContainerTypeInput): MutationResult {
  const c = db.containerTypes.find((x) => x.size === size);
  if (!c) return fail(`Container type ${size} not found.`);
  const before = `label "${c.label}", TEU ${c.teu}, max ${c.maxPerJourney}/journey, ${c.status}`;
  Object.assign(c, input);
  logAudit(db, {
    action: "Container Type Updated",
    module: "Master Data",
    entityId: size,
    description: `Container type ${size} updated (${before} → label "${c.label}", TEU ${c.teu}, max ${c.maxPerJourney}/journey, ${c.status}).`,
  });
  return { ok: true, id: size };
}

/* ---------------------------------------------------- Assignment sync helpers */

/** Make `trailerId` belong to `pmId` (or detach when null), keeping both sides consistent. */
export function assignTrailer(db: DB, pmId: string, trailerId: string | null) {
  const pm = db.primeMovers.find((p) => p.id === pmId);
  if (!pm) return;
  // release the previously linked trailer
  db.trailers.forEach((t) => {
    if (t.primeMoverId === pmId && t.id !== trailerId) t.primeMoverId = null;
  });
  if (trailerId) {
    // steal from any other prime mover
    db.primeMovers.forEach((p) => {
      if (p.id !== pmId && p.trailerId === trailerId) p.trailerId = null;
    });
    const t = db.trailers.find((x) => x.id === trailerId);
    if (t) t.primeMoverId = pmId;
  }
  pm.trailerId = trailerId;
}

/** Make `driverId` the driver of `pmId` (or detach when null); keeps Driver.primeMoverId in sync. */
export function assignDriver(db: DB, pmId: string, driverId: string | null) {
  const pm = db.primeMovers.find((p) => p.id === pmId);
  if (!pm) return;
  db.drivers.forEach((d) => {
    if (d.primeMoverId === pmId && d.id !== driverId) d.primeMoverId = null;
  });
  if (driverId) {
    db.primeMovers.forEach((p) => {
      if (p.id !== pmId && p.driverId === driverId) p.driverId = null;
    });
    const d = db.drivers.find((x) => x.id === driverId);
    if (d) d.primeMoverId = pmId;
  }
  pm.driverId = driverId;
}

/* -------------------------------------------------------------- Prime movers */

export type PrimeMoverInput = Omit<PrimeMover, "id" | "odometerKm"> & { odometerKm?: number };

export function savePrimeMover(db: DB, input: PrimeMoverInput, id: string, isNew: boolean): MutationResult {
  const reg = input.regNo.trim().toUpperCase();
  if (isNew && db.primeMovers.some((p) => p.id.toLowerCase() === id.toLowerCase())) return fail(`Vehicle ID ${id} already exists.`);
  if (db.primeMovers.some((p) => p.id !== id && p.regNo.toUpperCase() === reg)) return fail(`Registration ${reg} is already registered to another prime mover.`);
  if (db.trailers.some((t) => t.regNo.toUpperCase() === reg)) return fail(`Registration ${reg} is already used by a trailer.`);

  const { trailerId, driverId, ...rest } = input;
  let pm = db.primeMovers.find((p) => p.id === id);
  if (isNew) {
    pm = { id, trailerId: null, driverId: null, odometerKm: input.odometerKm ?? 0, ...rest, regNo: reg };
    db.primeMovers.push(pm);
  } else {
    if (!pm) return fail("Prime mover not found.");
    Object.assign(pm, { ...rest, regNo: reg, odometerKm: input.odometerKm ?? pm.odometerKm });
  }
  assignTrailer(db, id, trailerId);
  assignDriver(db, id, driverId);
  logAudit(db, {
    action: isNew ? "Prime Mover Created" : "Prime Mover Updated",
    module: "Master Data",
    entityId: id,
    description: `Prime mover ${id} (${reg}) ${isNew ? "created" : "updated"}: ${input.make} ${input.model} ${input.year}, ${input.status}, trailer ${trailerId ?? "none"}, driver ${driverId ?? "none"}.`,
  });
  return { ok: true, id };
}

export function setPrimeMoverStatus(db: DB, id: string, status: PrimeMover["status"]): MutationResult {
  const pm = db.primeMovers.find((p) => p.id === id);
  if (!pm) return fail("Prime mover not found.");
  const prev = pm.status;
  pm.status = status;
  logAudit(db, { action: status === "Inactive" ? "Prime Mover Deactivated" : "Prime Mover Status Changed", module: "Master Data", entityId: id, description: `Prime mover ${id} status ${prev} → ${status}.` });
  return { ok: true, id };
}

/* ----------------------------------------------------------------- Trailers */

export type TrailerInput = Omit<Trailer, "id">;

export function saveTrailer(db: DB, input: TrailerInput, id: string, isNew: boolean): MutationResult {
  const reg = input.regNo.trim().toUpperCase();
  if (isNew && db.trailers.some((t) => t.id.toLowerCase() === id.toLowerCase())) return fail(`Trailer ID ${id} already exists.`);
  if (db.trailers.some((t) => t.id !== id && t.regNo.toUpperCase() === reg)) return fail(`Registration ${reg} is already registered to another trailer.`);
  if (db.primeMovers.some((p) => p.regNo.toUpperCase() === reg)) return fail(`Registration ${reg} is already used by a prime mover.`);

  const { primeMoverId, ...rest } = input;
  let t = db.trailers.find((x) => x.id === id);
  if (isNew) {
    t = { id, primeMoverId: null, ...rest, regNo: reg };
    db.trailers.push(t);
  } else {
    if (!t) return fail("Trailer not found.");
    Object.assign(t, { ...rest, regNo: reg });
    // detach from the old prime mover if the link changes
    if (t.primeMoverId && t.primeMoverId !== primeMoverId) {
      const old = db.primeMovers.find((p) => p.id === t!.primeMoverId);
      if (old && old.trailerId === id) old.trailerId = null;
      t.primeMoverId = null;
    }
  }
  if (primeMoverId) assignTrailer(db, primeMoverId, id);
  logAudit(db, {
    action: isNew ? "Trailer Created" : "Trailer Updated",
    module: "Master Data",
    entityId: id,
    description: `Trailer ${id} (${reg}) ${isNew ? "created" : "updated"}: ${input.trailerType}, ${input.status}, prime mover ${primeMoverId ?? "unassigned"}.`,
  });
  return { ok: true, id };
}

export function setTrailerStatus(db: DB, id: string, status: Trailer["status"]): MutationResult {
  const t = db.trailers.find((x) => x.id === id);
  if (!t) return fail("Trailer not found.");
  const prev = t.status;
  t.status = status;
  logAudit(db, { action: status === "Inactive" ? "Trailer Deactivated" : "Trailer Status Changed", module: "Master Data", entityId: id, description: `Trailer ${id} status ${prev} → ${status}.` });
  return { ok: true, id };
}

export function nextVehicleId(items: { id: string }[], prefix: string): string {
  const n = items.reduce((m, x) => Math.max(m, Number(x.id.replace(/\D/g, "")) || 0), 0) + 1;
  return `${prefix}${String(n).padStart(3, "0")}`;
}
