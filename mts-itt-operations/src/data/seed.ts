import type { DB, Settings } from "@/types/db";
import { DEFAULT_TIMEZONE, OP_DAY_START_HOUR } from "@/lib/date-utils";
import { MOCK_CONTAINER_TYPES, MOCK_ROUTES, MOCK_TERMINALS } from "./mock-terminals";
import { MOCK_PRIME_MOVERS, MOCK_SERVICE_RECORDS, MOCK_TRAILERS } from "./mock-vehicles";
import { MOCK_DRIVERS, MOCK_LEAVES, MOCK_USERS, buildRoster } from "./mock-drivers";
import { generateMovements } from "./mock-movements";
import { buildImports, DEFAULT_MAPPINGS } from "./mock-imports";
import { buildExceptions } from "./mock-exceptions";
import { buildInvoices, buildRates } from "./mock-invoices";
import { buildPayRuns } from "./mock-payments";
import { buildFuel } from "./mock-fuel";
import { MOCK_NOTIFICATIONS, SEED_AUDIT } from "./mock-notifications";
import { demoToday } from "@/lib/date-utils";

export const DB_VERSION = 1;

export const DEFAULT_SETTINGS: Settings = {
  timezone: DEFAULT_TIMEZONE,
  opDayStartHour: OP_DAY_START_HOUR,
  currency: "AUD",
  billingUnitMode: "per-trailer",
  payUnitMode: "per-trailer",
  payRates: { "20FT": 14, "40FT": 21 },
  billRejected: false,
  billDamaged: false,
  payRejected: false,
  payDamaged: false,
  requireManagerApproval: true,
  driversPerTruck: null,
  fuelVarianceThresholdPct: 5,
  ocrConfidenceThreshold: 85,
  importMappings: { CWIT: { ...DEFAULT_MAPPINGS.CWIT }, SAGT: { ...DEFAULT_MAPPINGS.SAGT } },
};

/** Builds the full, internally consistent demo dataset. Payment/invoice drafts are computed from the seeded movements. */
export function createSeedDB(): DB {
  const { movements, docs, specials } = generateMovements();
  const db: DB = {
    version: DB_VERSION,
    settings: structuredClone(DEFAULT_SETTINGS),
    session: { userId: "U-001" },
    terminals: structuredClone(MOCK_TERMINALS),
    routes: structuredClone(MOCK_ROUTES),
    containerTypes: structuredClone(MOCK_CONTAINER_TYPES),
    primeMovers: structuredClone(MOCK_PRIME_MOVERS),
    trailers: structuredClone(MOCK_TRAILERS),
    drivers: structuredClone(MOCK_DRIVERS),
    roster: buildRoster(demoToday()),
    leaves: structuredClone(MOCK_LEAVES),
    movements,
    exceptions: [],
    imports: [],
    documents: docs,
    payRuns: [],
    invoices: [],
    rates: buildRates(),
    fuelRecords: [],
    gpsImports: [],
    serviceRecords: structuredClone(MOCK_SERVICE_RECORDS),
    fuelReviews: [],
    users: structuredClone(MOCK_USERS),
    audit: [],
    notifications: structuredClone(MOCK_NOTIFICATIONS),
    counters: { tick: 0, movement: movements.length, event: 100000, document: docs.length, audit: 0, notification: 100, exception: 0, import: 0, payrun: 0, invoice: 0, fuel: 1000 },
  };

  buildImports(db);
  buildExceptions(db, specials);
  for (const imp of db.imports) imp.exceptionsRaised = db.exceptions.filter((e) => e.importId === imp.id).length;
  buildPayRuns(db);
  buildInvoices(db);
  const fuel = buildFuel();
  db.fuelRecords = fuel.fuelRecords;
  db.gpsImports = fuel.gpsImports;
  db.counters.fuel = db.fuelRecords.length + 1000;
  db.counters.gps = db.gpsImports.length;
  db.counters.document = db.documents.length;
  db.counters.exception = Math.max(db.counters.exception, db.exceptions.length);

  db.audit = [...SEED_AUDIT]
    .sort((a, b) => b.at.localeCompare(a.at))
    .map((a, i, arr) => ({ ...a, id: `AL-${String(arr.length - i).padStart(5, "0")}` }));
  db.counters.audit = db.audit.length;
  return db;
}
