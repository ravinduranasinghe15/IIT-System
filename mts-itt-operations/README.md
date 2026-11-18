# MTS – Inter-Terminal Transport (ITT) Operations Management System (Demo)

Interactive, frontend-only demo by **Techneura Labs** for **Marine Transport Services (Pvt) Ltd (MTS)**.
No backend and no real integrations: all data is deterministic mock data persisted in `localStorage`.
All financial calculations and approvals are **demo simulations**; unconfirmed contract rules are configurable demo assumptions
(Settings → Business rules). OCR is a **simulated assisted-extraction** demo that always needs human verification.

## Run

```bash
npm install
npm run dev      # http://localhost:3000
npm run lint && npx tsc --noEmit && npm run build
```

Use the header **role switcher** to view the app as CEO, Manager, Supervisor
or Driver (frontend permissions only). *Reset demo data* is in the user menu / Settings.

## Try the lifecycle
1. **Terminal Imports → New**: upload `public/documents/sample-cwit.xlsx` or `sample-sagt.xlsx` (real SheetJS parsing, column mapping, validation, duplicate detection). Re-upload the same file → rejected as a duplicate file.
2. **Movements / Exceptions**: imported rows become movements; missing/conflicting data raises exceptions that block billing until resolved (manager approval for material corrections).
3. **Chits & Evidence**: attach chits, run simulated extraction, verify.
4. **Driver Payments** (`/payments?action=generate`) and **Invoicing** (`/invoicing/new`): drafts computed from eligible movements, effective-dated rates, diesel adjustment; approve (simulated).
5. **Fleet & Fuel**: GPS vs fuel-station reconciliation (originals never overwritten); import `13.11.2026_Trips-track-my-car.xlsx` (Track My Car Trips layout).
6. **Reports**: 12 reports with charts and CSV/Excel export. **Settings → Audit logs** records every action.

## Architecture (see `docs/`)
- `src/types` entity types · `src/data` deterministic seed · `src/contexts/app-context.tsx` single localStorage-backed store (`update(draft => …)`).
- `src/lib` pure business logic: operational day (07:00→07:00, one timezone), eligibility/billable status, reconciliation, pay and invoice calculators, import processor, reports.
- Billable status is **derived** from movement + exception state, so it cannot drift. A trailer with two 20 FT containers is one journey; billing/pay units follow the configurable per-trailer / per-container mode.
- Demo clock: "today" is fixed at 13 Nov 2026 so seeded data stays consistent; timestamps advance one minute per change.

## Notes
- `xlsx` (SheetJS 0.18.5 from npm) is used for demo file parsing only.
- Pages set `export const instant = false` because the demo is client-rendered from localStorage (Cache Components is kept enabled).
