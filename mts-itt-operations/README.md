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

Use the header **theme button** (sun/moon) to switch between **Light**, **Dark** and **System**; the choice is remembered in the browser.

Use the header **role switcher** to view the app as CEO, Manager, Supervisor
or Driver (frontend permissions only). *Reset demo data* is in the user menu / Settings.

## Try the lifecycle
The full, step-by-step demo script (with the expected numbers) is in **[DEMO-FLOW.md](DEMO-FLOW.md)**. In short:
1. **Terminal Imports → New** (Manager): import the CWIT and SAGT sample reports (13 Oct – 13 Nov, 544 movements). The driver of each movement comes from the **roster** (drivers are not tied to a truck).
2. **Chits & Evidence** (Supervisor): *Submit chits* → full chit pack (180 chits). Chits at or above the confidence threshold **and** passing the **cross-check** (terminal data, roster, driver logs) are verified automatically; the rest wait for a person.
3. **Driver Logs** (Supervisor): *Upload* → demo log pack. Verified logs set the real driver on the movements they cover.
4. **Billable only after the comparison**: both chits verified, the driver log verified, and the documents agree with the terminal data, the roster and each other (**Movement → Billing readiness**). Anything the system refused to verify is reviewed by a person.
5. **Driver Payments** and **Invoicing**: drafts from Billable movements only; approve (simulated).
6. **Fleet & Fuel**: import `13.11.2026_Trips-track-my-car.xlsx` and the sample fuel invoices; GPS vs fuel-station reconciliation; per-vehicle **Fuel & maintenance spend**.
7. **Roster** (generate for a week or date-wise, driver-not-coming), **Reports** (ITT analysis, shift filter), **CEO dashboard**, and the **assistant** (bot icon).

Re-check the logic any time: `npx tsx scripts/verify-demo-flow.ts` (also `npx tsc --noEmit && npm run lint`).

## Architecture (see `docs/`)
- `src/types` entity types · `src/data` deterministic seed · `src/contexts/app-context.tsx` single localStorage-backed store (`update(draft => …)`).
- `src/lib` pure business logic: operational day (07:00→07:00, one timezone), eligibility/billable status, reconciliation, pay and invoice calculators, import processor, reports.
- Billable status is **derived** from movement + exception state, so it cannot drift. A trailer with two 20 FT containers is one journey; billing/pay units follow the configurable per-trailer / per-container mode.
- Demo clock: "today" is fixed at 13 Nov 2026 so seeded data stays consistent; timestamps advance one minute per change.

## Notes
- `xlsx` (SheetJS 0.18.5 from npm) is used for demo file parsing only.
- Pages set `export const instant = false` because the demo is client-rendered from localStorage (Cache Components is kept enabled).
