import type { AppNotification, AppUser, AuditLog } from "./user";
import type { ContainerType, RouteRecord, Terminal } from "./terminal";
import type { Movement } from "./movement";
import type { ExceptionRecord } from "./exception";
import type { ColumnMapping, ImportRecord } from "./import";
import type { Driver, LeaveRecord, OpenShift, RosterEntry } from "./driver";
import type { PrimeMover, ServiceRecord, Trailer } from "./vehicle";
import type { FuelRecord, FuelReview, GpsImport } from "./fuel";
import type { EvidenceDoc } from "./evidence";
import type { PayRun, UnitMode } from "./payment";
import type { Invoice, RateRecord } from "./invoice";
import type { ContainerSize, TerminalCode } from "./terminal";

export interface Settings {
  timezone: string;
  /** Operational reporting day starts at this hour (7 => 07:00 to 07:00) */
  opDayStartHour: number;
  currency: string;
  /** DEMO ASSUMPTIONS – contractual treatment to be confirmed by MTS */
  billingUnitMode: UnitMode;
  payUnitMode: UnitMode;
  payRates: Record<ContainerSize, number>;
  billRejected: boolean;
  billDamaged: boolean;
  payRejected: boolean;
  payDamaged: boolean;
  requireManagerApproval: boolean;
  /** Unconfirmed in the proposal (9 prime movers / 20 drivers / "3 drivers per truck") */
  driversPerTruck: number | null;
  fuelVarianceThresholdPct: number;
  ocrConfidenceThreshold: number;
  /** Remembered column mappings per terminal */
  importMappings: Partial<Record<TerminalCode, ColumnMapping>>;
}

export interface DB {
  version: number;
  settings: Settings;
  session: { userId: string };
  terminals: Terminal[];
  routes: RouteRecord[];
  containerTypes: ContainerType[];
  primeMovers: PrimeMover[];
  trailers: Trailer[];
  drivers: Driver[];
  roster: RosterEntry[];
  leaves: LeaveRecord[];
  openShifts: OpenShift[];
  movements: Movement[];
  exceptions: ExceptionRecord[];
  imports: ImportRecord[];
  documents: EvidenceDoc[];
  payRuns: PayRun[];
  invoices: Invoice[];
  rates: RateRecord[];
  fuelRecords: FuelRecord[];
  gpsImports: GpsImport[];
  serviceRecords: ServiceRecord[];
  fuelReviews: FuelReview[];
  users: AppUser[];
  audit: AuditLog[];
  notifications: AppNotification[];
  counters: Record<string, number>;
}
