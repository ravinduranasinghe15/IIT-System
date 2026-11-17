import type { DB, Settings } from "@/types/db";
import { DEFAULT_TIMEZONE, OP_DAY_START_HOUR } from "@/lib/date-utils";
import { MOCK_CONTAINER_TYPES, MOCK_ROUTES, MOCK_TERMINALS } from "./mock-terminals";
import { MOCK_PRIME_MOVERS, MOCK_TRAILERS } from "./mock-vehicles";
import { MOCK_DRIVERS, MOCK_USERS, buildRoster } from "./mock-drivers";
import { DEFAULT_MAPPINGS } from "./mock-imports";
import { buildRates } from "./mock-invoices";
import { realToday } from "@/lib/date-utils";

export const DB_VERSION = 12;

export const DEFAULT_SETTINGS: Settings = {
  timezone: DEFAULT_TIMEZONE,
  opDayStartHour: OP_DAY_START_HOUR,
  currency: "LKR",
  billingUnitMode: "per-trailer",
  payUnitMode: "per-trailer",
  payRates: { "20FT": 1000, "40FT": 1500 },
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

/**
 * Builds a clean "new system" database: configuration and master data only (terminals, routes, rates, fleet, drivers,
 * roster, users, settings). There are NO transactions – movements, exceptions, imports, payments, invoices, fuel and
 * audit start empty and are created by using the system (e.g. importing the demo terminal report).
 */
export function createSeedDB(): DB {
  return {
    version: DB_VERSION,
    settings: structuredClone(DEFAULT_SETTINGS),
    session: { userId: "U-001" },
    terminals: structuredClone(MOCK_TERMINALS),
    routes: structuredClone(MOCK_ROUTES),
    containerTypes: structuredClone(MOCK_CONTAINER_TYPES),
    primeMovers: structuredClone(MOCK_PRIME_MOVERS),
    trailers: structuredClone(MOCK_TRAILERS),
    drivers: structuredClone(MOCK_DRIVERS),
    roster: buildRoster(realToday()),
    leaves: [],
    openShifts: [],
    movements: [],
    exceptions: [],
    imports: [],
    documents: [],
    payRuns: [],
    invoices: [],
    rates: buildRates(),
    fuelRecords: [],
    gpsImports: [],
    serviceRecords: [],
    fuelReviews: [],
    users: structuredClone(MOCK_USERS),
    audit: [],
    notifications: [],
    counters: { tick: 0, movement: 0, event: 100000, document: 0, audit: 0, notification: 100, exception: 0, import: 0, payrun: 0, invoice: 0, fuel: 1000, gps: 0 },
  };
}
