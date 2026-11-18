# MTS ITT Operations – step-by-step demo flow

Everything below runs on the shipped demo data. The numbers were produced by running the same business logic that the app
uses (`npx tsx scripts/verify-demo-flow.ts` prints them again at any time). Document IDs (DOC-xxxx) are only the same if you
follow the steps **in this order on freshly reset data**.

> The reader of the chits and driver logs is a **simulation** (it replays fixed values with fixed confidence scores) – there is
> no real OCR. Say so at the start of the demo.

## 0. Before you start
1. `npm run dev` → open http://localhost:3000.
2. User menu (top right) → **Reset demo data**. You start as **Manager** (Hasini Jayawardena).
3. Role switcher (header): CEO · Manager · Supervisor · Driver. Supervisor and Driver show a phone-sized view on a desktop.
4. Facts to mention: two 12-hour shifts (Morning 7a–7p, Night 7p–7a); the operational day runs 07:00 → 07:00; "today" in the demo is **13 Nov 2026**.
   Drivers are **not tied to a truck**: the terminal reports name only the truck, so the driver comes from the roster and is corrected by a verified driver log.
   There are **20 drivers** and 8 active trucks (PM-006 is in maintenance). **Every active truck runs both shifts every day** (16 driver-shifts a day), which needs about 19–20 drivers under the rules (12-hour shift, one shift a day, 8 h rest, a day off in every 7).

## 1. Manager – import the two terminal reports
**Terminal Imports → New terminal import**
1. Click **CWIT sample report** → *Import report*. Result: **306 movements**, 2 exceptions.
2. Back to *New terminal import* → **SAGT sample report** → *Import report*. Result: **238 movements**, 0 exceptions.
3. Try the same file again → it is rejected as a **duplicate file**.
4. Open **Movements**: 544 movements from **13 Oct to 13 Nov**, sorted by ID. Every row on a fleet truck already has a **driver** (543 of 544, taken from the roster for that truck and shift); the movement page says "from roster". The status is *In Transit* – nothing is billable yet.
5. **Exceptions**: 2 raised, both on **MV-0306** (truck LY5999 is not in the fleet → *Truck Number Mismatch*, and so no driver). Billing stays blocked until an exception is resolved.

## 2. Supervisor – submit the chits
Switch to **Supervisor** → **Chits & Evidence** (chits and driver logs are separate sections) → **Submit chits**.
1. Choose **use the full chit pack (180 chits, 9 – 13 Nov)** → *Submit 180 chits*.
2. Result: **143 chits verified automatically**, **37 wait for a person**. **90 movements become Completed** (both chits are in).
3. Explain the rule (Settings → *OCR confidence threshold*, 80%): a chit is verified by the system only if
   its confidence is at or above the threshold **and** it passes the **cross-check**:
   container, truck, terminal and time (±30 min) against the terminal data, the driver against the roster/movement and any driver log, and a discharge never before its loading.
   Anything that does not agree is **never verified automatically**.
4. Open **DOC-0003** (loading chit of MV-0298): the *Cross-check* panel lists the mismatch – the driver was misread as "Kasun Fernado".

## 3. Supervisor – submit the driver logs
**Driver Logs → Upload driver log**
1. Choose **submit the demo log pack (295 sheets, 13 Oct – 13 Nov)**.
2. Result: **256 sheets verified automatically, 39 wait for a person**; **499 movements are now covered**, **45 still have no log**.
3. A sheet is verified automatically only if it is confident **and** the cross-check passes: its driver is the roster driver, every container on the sheet is a covered movement (and every covered container is on the sheet), and it agrees with the chits.
4. When a log is verified it sets the **real driver** on the movements it covers; the "Driver Information Missing" exception closes itself.
5. Open any verified sheet → the **Ledger value** column compares each field with the terminal data / roster.

## 4. Where things stand now (all movements)
Billable **43** · Pending Chits **32** · Pending Driver Log **15** · Blocked – Exception **1** · Pending Completion **453** (not yet completed – no chits submitted for them).

Look at **13 Nov** in *Movements* (filter loading date). Open **MV-0297** → **Billing readiness** shows the whole checklist:
movement completed → loading chit verified (by *System (auto)*) → discharge chit verified → driver log verified → **cross-check passed** → no open exceptions → **Billable**.

## 5. Review what the system refused to verify (Manager or Supervisor)
**Chits & Evidence → filter "Needs Verification"** – open each one, read the *Cross-check* panel, correct the values and press **Verify extraction**.

| Document | Movement | Why it was not verified | What to do |
|---|---|---|---|
| DOC-0003 `LC-MRSU3411064` | MV-0298 | driver misread as "Kasun Fernado", 64% confidence | change driver to **Kasun Fernando**, verify → **MV-0298 becomes Billable** |
| DOC-0174 `DC-HASU5167002` | MV-0543 | driver misread ("Ruwan Wickramasinge"), low confidence | correct the name (Ruwan Wickramasinghe), verify |
| DOC-0156 `DC-OOCU7036710` | MV-0542 | **discharge time 13:40 is before the loading time 14:20** | fix the time (e.g. 15:10), verify |
| DOC-0160 `DC-TXGU7963720` | MV-0305 | **terminal** CICT vs JCT | read the original, set JCT, verify |
| DOC-0163 `LC-MRKU9895596` | MV-0538 | **terminal** CWIT vs SAGT | read the original, set SAGT, verify |
| DOC-0167 `LC-MRKU5758110` | MV-0540 | **truck** on the chit is LY-6178, the movement is LY-5520 | correct to LY-5520, verify |
| DOC-0168 `DC-MRKU5758110` | MV-0540 | **driver** on the chit is Isuru Senanayake, roster has Nimal Herath | compare with the driver log of LY-5520 (DOC-0473), decide who is right, verify |
| DOC-0473 `LOG-2026-11-13-Morning-LY5520` (driver log) | MV-0299, MV-0540 | it names Nimal Herath, which disagrees with chit DOC-0168 | open, check the driver, verify (MV-0299 becomes Billable) |

Points to make: verifying a document yourself counts as the **review** of its mismatches. If you verify a chit whose container number
differs from the terminal data, the system raises a *Container Number Mismatch* exception and blocks billing (try this on `DC-UETU1002951`, the discharge chit of MV-0256).

## 6. Close a missing driver log
**Driver Logs → Missing driver logs** lists the 45 movements with no sheet. For **LY-6178, 13 Nov, Morning** (MV-0302 and MV-0541):
1. Click **Upload** on the row (lorry, date, shift are pre-filled).
2. Choose the file `public/documents/driver-logs/LOG-2026-11-13-Morning-LY6178.png` – the form fills itself from the file name.
3. Upload → verified automatically → **MV-0302 and MV-0541 become Billable** (both already have verified chits).

## 7. Show that the cross-check also protects after the fact
Manager → **MV-0297** → **Edit** → change the prime mover to **PM-002** → save. The status changes to **Blocked – Mismatch** and *Billing readiness* lists the conflicts between the chits, the driver log and the movement. Change it back to **PM-001** → Billable again.

## 8. Money – invoices and driver pay (Manager)
1. **Driver Payments → Generate** a 15-day draft for 1 – 15 Nov: only **Billable** movements are paid; the others are listed as excluded with the reason (e.g. "Not billable (Pending Chits)"). Add an adjustment, submit, approve (simulated).
2. **Invoicing → New invoice draft** for November: only Billable movements at the effective rate card, diesel adjustment, submit/approve.
3. The Manager's dashboard card *Pay awaiting approval* and the CEO dashboard show the same figures.

## 9. Fleet, fuel and GPS (Manager)
1. **Fleet → Fuel & reconciliation → Import Track My Car** → *Sample GPS file* (31 days, 13 Oct – 12 Nov, MTS's real *Trips* layout).
2. **Import fuel invoices** → sample file (68 invoices).
3. The reconciliation compares GPS litres with fuel-station litres per truck per month: **PM-004 (+9%), PM-007 (+14%), PM-008 (−8%)** are flagged; **PM-001 shows −21%** in November until you **Add fuel entry** with `public/documents/sample-fuel-receipt.png` (120 L) – then it is within +1%.
4. **Fleet → PM-001 → Fuel & maintenance spend**: last fuel pumped, maintenance history, spend per month and per trip.

## 10. Roster (Manager and Supervisor)
1. **Drivers & Roster**: grid and calendar views, two shifts, one driver per truck per shift. The default roster has **all 8 active trucks on both shifts every day** with 20 drivers; the tiles show "8 of 8 trucks" for Morning and Night.
2. Manager → **Generate roster**: choose next week, set **8 trucks on Morning and 8 on Night** (whole week, then date-wise), look at the preview (**112 of 112 truck-shifts covered**) and **Publish**.
3. Supervisor → **Driver not coming** (reason) → the Manager gets a notification and an open shift → Manager **Assign driver**.

## 11. Reports, CEO and the assistant
1. **Reports → ITT analysis (MTS format)**: weekly/daily/monthly, **shift filter** (Morning / Night), Excel/PDF export; *Standard reports* has a Shift filter too.
2. Switch to **CEO**: Executive dashboard (Today / Week / Month and a shift switch), Reports.
3. The **bot icon** (bottom right) answers questions such as "Which movements are missing chits?", "Who is on shift today?", "How much did we spend on PM-001?".

## 12. Driver
Switch to **Driver** (Sampath Jayasinghe): own dashboard and trips, own roster, request leave. No financial information.

---
### If something looks different
* Reset the data (user menu) and repeat the steps in order.
* Regenerate the demo files: `npx tsx scripts/generate-sample-reports.mjs` (terminal reports, chits, driver logs), `node scripts/generate-trackmycar.mjs`, then `node scripts/generate-fuel-invoices.mjs`.
* `npx tsc --noEmit && npm run lint` are clean; `npx tsx scripts/verify-demo-flow.ts` replays steps 1–5 against the business logic.
