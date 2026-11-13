# Architecture & contracts (FOUNDATION – already built; do not rewrite)

Stack: Next.js 16 App Router (`cacheComponents: true`) · React 19 · TypeScript strict · Tailwind v4 · shadcn/ui (**base-nova style = Base UI, NOT Radix**:
use the `render` prop instead of `asChild`, e.g. `<DropdownMenuTrigger render={<Button/>}>`, `<Button render={<Link href=".."/>}>`) · lucide-react · Recharts 3 · react-hook-form + zod 4 (`@hookform/resolvers`) · date-fns · xlsx · sonner.
Read `AGENTS.md` – this Next.js has breaking changes; docs live in `node_modules/next/dist/docs/`.

## Layout of src/
- `types/*` entity types; `types/db.ts` = the whole demo DB (`DB`) + `Settings`.
- `data/*` seed builders (deterministic). `createSeedDB()` in `data/seed.ts`.
- `contexts/app-context.tsx`: `useApp()` → `{ db, update, reset }`. `update(draft => { ...mutate draft... ; return x })` deep-clones the DB, increments the demo clock tick,
  runs your mutator, persists to localStorage and re-renders. ALL writes go through `update`. Never mutate `db` directly. `useAppState().ready` is false until hydrated;
  `AppLayout` (rendered in the root layout via `providers/app-providers.tsx`) only renders pages once ready, so pages can call `useApp()` freely.
- `contexts/auth-context.tsx`: `useAuth()` → `{ user, role, driverId, isDriver, setRole, can(action), canAccess(path), canSeeFinancials }`. Actions are in `lib/permissions.ts` (`ACTIONS`).
- `lib/db-helpers.ts`: `nowOf(draft)` (demo clock – use for every timestamp written), `nextId(draft,key,prefix,pad)`, `logAudit(draft,{action,module,description,entityId?,financial?})`, `notify(draft,{title,body,level,href})`, `actorOf(draft)`.
- `lib/date-utils.ts`: wall-clock ISO strings ("yyyy-MM-ddTHH:mm") in one timezone. `operationalDay(iso)`, `operationalDayRange`, `addDays`, `eachDay`, `demoToday()` (= today's operational day, 2026-11-13), `DEMO_NOW`, `formatDate/Time/DateTime/Day/Month`, `monthRange`, `payPeriods()`, `parseLooseDate`.
- `lib/eligibility.ts`: `unitsFor`, `movementDay`, `billableStatus`, `payEligibility`, `invoiceEligibility`, `unresolvedExceptionsFor`.
- `lib/reconciliation.ts`: `detectIssues`, `raiseExceptions`, `scanMissingEvidence`. `lib/mutations/movement.ts`: `createMovement`, `updateMovement`, `approveMovementCorrection`, `validateJourney`, `runEvidenceReconciliation`.
- `lib/payment-calculator.ts`, `lib/invoice-calculator.ts`: pure calculators used by seed data AND UI (single source of truth). `lib/container.ts`: ISO 6346 validation. `lib/export-utils.ts`: CSV/XLSX download. `lib/excel-parser.ts`: SheetJS parsing + `suggestMapping`.
- `hooks/use-lookups.ts` (driverName, pmReg…), `hooks/use-local-storage.ts`.
- `components/shared/*`: `PageHeader`, `StatCard`, `StatusBadge`, `DataTable` (sort + pagination, `Column<T>`), `SearchInput`, `NativeSelect` (styled native select – use for ALL selects), `Field`, `FormDialog`, `ConfirmDialog`, `EmptyState`, `LoadingState`, `FileDropzone`, `SectionCard`, `KeyValue`.
- `components/evidence/document-preview.tsx`: `DocumentPreview({doc})`, `chitSvgDataUrl`.
- `components/ui/*` shadcn primitives (Base UI). Tailwind brand tokens: `text-navy`, `bg-navy`, `text-brand`, `text-success`, `text-danger`, `text-ink`, `text-slate`, `bg-warning`.
- `lib/constants.ts`: `NAV_ITEMS`, `TERMINAL_COLORS`, `CHART_COLORS`, `ASSUMPTION_NOTE`, `CURRENCIES`.

## Conventions
- Each `page.tsx` is a SERVER component: `export const metadata` + `export const instant = false;` + render a client view component (e.g. `<MovementsView />` from `components/<module>/…`). Dynamic routes (`[id]`) render a client view that reads `useParams()`; do NOT `await params` in the page.
- NEVER call `new Date()` (no args), `Date.now()` or `Math.random()` during render/module init (cacheComponents prerender errors). Use `DEMO_NOW`/`demoToday()`; inside `update()` use `nowOf(draft)`; generate ids with `nextId`.
- Business logic lives in `lib/` (pure functions on `DB` / draft), UI in `components/`. Domain mutators go in `lib/mutations/<module>.ts` (`(draft: DB, …) => result`), each logging via `logAudit` (+ `notify` when useful). Wrap them in thin hooks in `hooks/use-<module>.ts` where handy.
- Role gating: hide/disable controls with `useAuth().can("…")`; driver users never see financial info (`canSeeFinancials`) and only their own data (`driverId`).
- Forms: react-hook-form + zod with inline error messages; selects via `Controller` + `NativeSelect`. Every action gives a sonner toast; destructive/important actions use `ConfirmDialog`.
- Links between modules: `/movements/[MV-0001]`, `/exceptions/[EX-0001]`, `/terminal-imports/[IMP-0001]`, `/drivers/[DR-001]`, `/fleet/[PM-001]`, `/payments/[PAY-001]` (PayRun.id), `/invoicing/[INV-0001]` (Invoice.id), `/evidence?doc=DOC-0001`, `/evidence?movement=MV-0001`.
- Ensure responsive layout (tables scroll horizontally; grids collapse). No `any`; fix lint/TS errors rather than suppressing. Dense, professional look; consistent terminology.
- Verify only your own files: `npx tsc --noEmit 2>&1 | grep -E "<your paths>"` and `npx eslint <your dirs>`. Other agents are writing other modules in parallel, so unrelated errors are not yours. The dev server may already run at http://localhost:3000 (do not start another; use the browser tools only if helpful, and avoid long sessions).
- Only create/edit files you own. If a shared file/lib has a bug or lacks something small, make the minimal backwards-compatible fix and mention it in your final report. Do not git commit.
