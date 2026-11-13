# MTS ITT Operations – demo module spec (condensed from the product brief)

Frontend-only DEMO for Marine Transport Services (Pvt) Ltd (MTS) by Techneura Labs. Inter-Terminal Transport of
transhipment containers between Port of Colombo terminals. No backend, no real integrations. Everything is
client-side with mock data persisted in localStorage (see FOUNDATION in `docs/ARCHITECTURE.md`).
Every visible button/link/form must work. No placeholders. All financial figures and approvals are demo simulations.
Design: premium, dense enterprise SaaS (navy/white/grey/green). Each page needs: title, short description, KPI cards where
relevant, search + filters, professional tables, status badges, detail views, create/edit forms, confirmation dialogs for
important actions, toasts, empty states, validation messages, responsive layout.

## Core business rules (apply everywhere)
1. One physical journey = one 40FT container OR up to two 20FT containers. Two 20FT on one trailer = ONE journey (store both
   container numbers, never create two journeys). Journeys and container units are separate concepts.
2. Billable / payable units follow configurable demo rules (`settings.billingUnitMode`, `settings.payUnitMode`:
   "per-trailer" = 1 unit per journey, "per-container" = 1 unit per container). The contractual treatment is UNCONFIRMED –
   label it as a demo assumption (`ASSUMPTION_NOTE` in `lib/constants.ts`).
3. Re-importing the same file must not create duplicate counted movements. Imported records are validated before becoming
   confirmed movements. Missing/conflicting data goes to the exception queue. Unresolved exceptions never silently become billable.
4. Rejected/damaged deliveries keep evidence + history. Operational day = 07:00→07:00 in one configured timezone (use `lib/date-utils.ts`).
5. Driver pay every 15 days; terminal invoicing monthly; rates effective-dated; diesel adjustment configurable.
6. Financially material corrections/approvals are recorded in the audit log. GPS, fuel-station and terminal records are preserved separately
   (never overwritten). OCR is SIMULATED assisted extraction and always needs human verification (never claim real OCR).
7. Driver-role users must never see financial information and only see their own movements/roster.
8. Where the proposal is silent use configurable, clearly-labelled demo assumptions. Staffing (9 prime movers / 14 drivers / "3 drivers per
   truck") is unconfirmed – never hard-code a staffing rule; show a note that it needs confirmation.
9. Currency: demo currency is AUD (`db.settings.currency`, configurable). Use `formatMoney(n, db.settings.currency)`.

## Routes & features per module

### /dashboard
KPI cards: Total Movements Today (current operational day), Completed, Pending, Exceptions (open/under review), Active Prime Movers,
Registered Drivers, Total Containers Transported (container count, not journeys). Recharts: daily movement trend line (completed /
pending / rejected), movements by terminal bar (CWIT, SAGT, CICT), container distribution donut (20FT/40FT), fleet utilisation (active vs
inactive). Sections: Recent Movements table, Recent Exceptions, Recent Import Activity, Fleet Status, Terminal Performance, Quick Actions
(Import Terminal Report → /terminal-imports/new, Register Movement → /movements/new, Review Exceptions → /exceptions,
Generate Pay Draft → /payments?action=generate, Create Invoice Draft → /invoicing/new). Stats derive from the shared DB so they update when data changes.
Driver role: a reduced dashboard with only their own movements/roster (no financial or fleet-wide data).

### /movements (central ledger), /movements/new, /movements/[id]
Table columns: Movement ID, Container Number(s), Size, Source, Destination, Prime Mover, Trailer, Driver, Date, Time, Status, Billable Status, Actions.
Filters: search movement ID, container number, terminal, driver, truck, size, status, date range, billable status. Sorting + pagination.
Statuses: Pending, In Transit, Completed, Rejected, Damaged, Under Review. Billable status is DERIVED via `billableStatus()`.
Create form (react-hook-form + zod): container number(s) (1–2; validate ISO 6346 via `checkContainerNo`, enforce journey rule via
`validateJourney`), size, source/destination terminal (only active routes), prime mover, trailer, driver, loading and discharge date/time, status,
supporting document attachment (creates an EvidenceDoc, small files stored as data URL), notes.
Detail page: movement info, container info, truck/trailer, driver, loading info, discharge info, source terminal info, attached chits/docs
(with `DocumentPreview`), reconciliation history, exception history, audit trail (movement.events + audit log entries for the movement).
Edit via dialog (use `updateMovement` – material changes by non-managers need manager approval; managers can `approveMovementCorrection`).
Driver role: only own movements, no billable column.

### /terminal-imports, /terminal-imports/new, /terminal-imports/[id]
Sources CWIT, SAGT, CICT (CICT = conditionally available, subject to receiving/validating a usable sample format – present it so).
Wizard: select terminal → drag&drop upload (XLSX/XLS/CSV, REAL parsing with SheetJS via `lib/excel-parser.ts`) → preview → map columns to
standard fields (Container Number, Size, Source Terminal, Destination Terminal, Truck Number, Trailer Number, Driver, Loading Time,
Discharge Time, Movement Status; remember mapping per terminal in `settings.importMappings`) → validate (missing/invalid container numbers,
missing terminal, invalid dates, duplicates, missing truck, missing driver) with clear status indicators → review duplicates → confirm import →
results. Duplicate detection: store file name + fingerprint; a repeated file is rejected as a duplicate file (record kept in history, no
movements created); potential duplicate rows (same container + source terminal + operational day, in DB or within the file) flagged for review.
Never silently discard invalid/duplicate rows – keep them in the import record with reasons (allow download of rejected rows as CSV).
Imported valid rows become Movements (origin "Import") and run reconciliation (`createMovement` raises exceptions e.g. missing driver/truck/discharge time);
import history updates; dashboard reflects it. History table: Import ID, file, terminal, uploaded by, date, total, successful, failed, duplicate, status.
Detail page/dialog per import with row-level results. Provide downloadable sample files in `public/documents/` (sample-cwit.xlsx, sample-sagt.xlsx) with
different column layouts, valid rows, invalid rows, duplicates of existing movements and rows with missing driver/truck.

### /exceptions, /exceptions/[id]
Categories: Missing Loading Chit, Missing Discharge Chit, Container Number Mismatch, Destination Mismatch, Truck Number Mismatch, Driver Information
Missing, Duplicate Movement, Rejected Delivery, Damaged Container, Missing Arrival Time. KPI cards: Total, Critical, Pending Review, Resolved, Rejected.
Table: Exception ID, Movement ID, Container, Type, Source Terminal, Priority, Date Reported, Assigned To, Status, Actions (+ filters).
Detail: conflicting info (system vs source terminal record side by side), related movement, supporting documents, comments, correct movement info
(via `updateMovement`), assign reviewer, resolve, reject with reason. Workflow Open → Under Review → Resolved / Rejected.
Unresolved exceptions block billable status. Manager must approve financially material corrections (`materialCorrection` / `movement.pendingApproval`).
Every correction/resolution creates an audit record. A "Run evidence reconciliation" action (`runEvidenceReconciliation`) scans for missing chits.

### /evidence
Document management for loading/discharge chits, driver log sheets, fuel invoices, other. Upload images + PDFs, attach to movement, view/preview,
show type, upload date, uploaded by, linked movement, document history. Assisted OCR DEMONSTRATION (simulated, deterministic): extract Container Number,
Truck Number, Driver Name, Terminal, Date/Time, Loading/Discharge with confidence %, original preview alongside editable values, mandatory human
verification action (audit logged). State clearly it is NOT real OCR (assisted extraction pilot with mandatory human validation).
Supports `/evidence?movement=MV-0001` and `?doc=DOC-0001` query params.

### /drivers, /drivers/new, /drivers/[id], /drivers/roster
Directory: Driver ID, Name, Contact, Assigned Prime Mover, License No, Employment Status, Shift, Total Movements, Actions. Register/edit drivers, assign prime mover,
update status. Profile: personal/employment info, assigned vehicle, movement history, attendance history, payment history (finance-gated: hidden for roles
without financial access), leave history. Roster: two-week calendar (db.roster, 2026-11-09 → 2026-11-22), shift assignments (Morning/Night/Off/Leave),
prime-mover assignments, attendance recording (Present/Absent/Late), leave management (request/approve/reject), shift status; continuous 24h operation (show morning/night coverage per day);
show a clear note that actual staffing rules (9 prime movers / 14 drivers / "3 drivers per truck") need confirmation – no hard-coded staffing rule, configurable assignments.
Driver role sees only their own roster row.

### /payments, /payments/[id]
KPIs: Current Pay Period, Total Drivers, Total Eligible Movements, Total Draft Payments, Approved Payments. Table: Driver ID, Name, Completed Movements, Eligible Payable Units,
Rate, Adjustments, Total Earnings, Status, Actions. Total = Eligible Payable Units × Rate + Adjustments (rates per size in settings; demo simulation). Workflow:
select a 15-day period → generate draft (`computePayLines`; excludes unresolved/unapproved movements, show exclusions with reasons) → review per-driver breakdown →
add adjustments → approve (simulated, finance/admin only, audit-logged, approval history). `/payments?action=generate` opens the generate dialog.
Demo assumption labels for unit mode. Approved runs are immutable (reopen not required).

### /invoicing, /invoicing/new, /invoicing/[id]
KPIs: Total Invoice Drafts, Pending Approval, Approved Invoices, Total Invoice Value. Create: select terminal, billing month, route, container size → retrieve eligible billable movements
→ apply effective-dated route rates (`findRate`) → configurable diesel adjustment (rate-card % or override) → totals (`calculateInvoice`) → save draft. Excluded movements listed with reasons
(unresolved exceptions, no effective rate, already invoiced). Workflow Draft → Pending Approval → Approved → Exported (approval finance/admin only, audit-logged; invoice stays Draft until a manager approves).
Detail: Invoice No, billing period, terminal, total movements, container breakdown, route breakdown, base amount, diesel adjustment, final amount, line items, history; invoice preview, print
(window.print with print CSS), CSV export, PDF via print dialog. No ERP posting. Rate Master UI (`components/invoicing/rate-management.tsx`, also used by /master-data/rates): Source, Destination, Size, Base Rate, Effective From/To, Diesel Adj %, Status; add/edit/deactivate rates (effective dating).

### /fleet, /fleet/[id], /fleet/fuel
Directory (9 prime movers PM-001..009): Vehicle ID, Reg No, Type, Assigned Trailer, Current Driver, Status, Total Movements, Service Status. Details: vehicle info, movement history, driver assignments, service records, fuel records, GPS import history.
Fuel: manual entry, fuel invoice attachment, GPS-reported fuel records, Track My Car sample file import (CSV/XLSX, real parsing, preserves originals), consumption info, discrepancy detection.
Reconciliation view: per vehicle & month show GPS litres, fuel-station invoice litres, difference, % variance, flag above `settings.fuelVarianceThresholdPct`; authorised users review (status/note) – never overwrite originals.
Service logs: vehicle, date, type, description, cost, next service date, status (add/edit). No advanced maintenance/claims automation.

### /reports
12 reports: Daily/Weekly/Monthly Movement, Driver Performance, Vehicle Performance, Terminal Performance, Route Performance, Container Distribution, Exception, Driver Payment, Invoice, Fuel Reconciliation.
Filters: date range, terminal, driver, vehicle, route, container size, movement status. Recharts: movement trends, terminal comparison, driver performance, vehicle utilisation, container distribution, fuel consumption,
revenue trends, exception trends. Export filtered data as CSV and Excel (`lib/export-utils.ts`). Operational day boundary 07:00→07:00 via helper. Financial reports only for roles with financial access
(Finance Manager/Administrator); Operations Manager gets non-financial reports.

### /master-data (+ /terminals, /routes, /containers, /vehicles, /trailers, /rates)
Terminals (CWIT, SAGT, CICT conditional, JCT destination, ECT not operational), Routes (source, destination, code, description, status), Containers (20FT/40FT, max per journey), Prime Movers, Trailers (assignments), Rates (route + size, effective dated).
All editable through functional forms (add/edit/deactivate) with zod validation and audit logging.

### /settings, /settings/users, /settings/roles, /settings/audit-logs
Business-rule settings (all labelled demo assumptions): timezone, operational day start hour, currency, billing unit mode, pay unit mode, pay rates, bill/pay rules for rejected & damaged, manager-approval requirement,
drivers-per-truck (unconfirmed, optional), fuel variance threshold, OCR confidence threshold; "Reset demo data". Users: demo accounts for the six roles (create/edit/disable). Roles page: matrix of the role access rules
(see `lib/permissions.ts`) – display only. Audit logs: Activity ID, User, Action, Module, Date/Time, Description with filters/search/CSV export.
Role access (demo, frontend only): Administrator all; Operations Manager movements/imports/exceptions/drivers/roster/reports; Operations Staff movement registration, imports, document uploads; Supervisor chit evidence,
attendance, exception review; Finance Manager payments, invoices, financial reports; Driver own movements/roster only.
