# Assumptions

Every assumption in Quote desk, in one place. IDs are stable so code comments, tests
and the seed data can point back here. Status is **Given** (from the brief),
**Decided** (a recommendation you approved) or **Open** (needs your answer).

This file grows with each phase. Sections marked *(Phase N)* are filled in as that phase lands.

## 1. Costing formulas (all from the brief, treated as assumptions)

| ID | Assumption | Status |
|----|------------|--------|
| F-01 | Material cost per unit = gross weight (kg) × material rate per kg − (gross − net weight) × scrap recovery rate per kg | Given |
| F-02 | Conversion cost per unit = Σ over routing operations of (cycle time min ÷ 60 × hour rate ÷ efficiency) | Given |
| F-03 | Setup and tooling cost are amortised over each volume tier, so unit price falls at higher volumes | Given |
| F-04 | Freight per unit may vary by volume tier | Given |
| F-05 | Overhead = overhead % × conversion cost (not on material) | Given |
| F-06 | Margin = margin % × total cost; price per unit = total cost + margin | Given |
| F-07 | GST defaults to 18%, is configurable, and is shown on its own line, never inside price per unit | Given |
| F-08 | Check value: 3.2 min at ₹850/hr = ₹45.33 per piece conversion. That is 3.2 ÷ 60 × 850 = 45.3333…; the check implies efficiency 1.0 for this case | Given |
| F-09 | Volume tiers are 0.5×, 1×, 1.5× of the part's annual volume | Given |
| F-10 | **Scrap allowance.** Scrap % is an extra material allowance on gross weight: kg bought = gross × (1 + scrap % ÷ 100). Material cost = gross × (1 + scrap %) × rate − (gross − net) × recovery rate. See 1a | Decided |
| F-11 | Efficiency is stored per machine on the machine rate (0 < efficiency ≤ 1), not typed per quote | Decided |
| F-12 | Setup and tooling are entered per part as one-off rupee amounts, not rate masters | Decided |
| F-13 | Annual value = price per unit × tier volume, **excluding GST**. GST stays on its own line and is never added into annual value. The approval check uses the pre-GST annual value of the 1× tier only | Decided |
| F-14 | Tier volume = annual volume × 0.5, 1 or 1.5, rounded half-up to whole pieces, minimum 1. Annual volume itself must be a whole number of at least 1 | Decided |
| F-15 | Setup + tooling per unit = (setup + tooling) ÷ tier volume, rounded to paise, and shown as its own visible row "Setup + tooling" | Decided |
| F-16 | Freight is entered per unit, as three inputs (0.5×, 1×, 1.5×) that default to the same value. No shipment-size model | Decided |
| F-17 | Packing is one per-unit input, the same in every tier | Decided |
| F-18 | **The brief's "margin %" is markup on cost, not gross margin.** Markup = markup % × total cost; price per unit = total cost + markup. A 10% markup gives a gross margin of about 9.1%. The UI label reads "Margin (markup on cost)" and code uses `markupPercent` | Decided |
| F-19 | Total cost per unit = material + conversion + setup + tooling + overhead + packing + freight, each already rounded to paise. Setup + tooling is inside the cost base that markup is applied to | Decided |
| F-20 | GST per unit = GST % × price per unit, rounded to paise, shown beneath price. Default 18%, configurable; 0 is allowed | Decided |
| F-21 | Overhead % is applied to conversion cost only, and not to material, setup + tooling, packing or freight | Given |
| F-22 | **Starting values on a new costing:** scrap allowance 2%, packing ₹1.50 and freight ₹2.00 per unit, markup 10%, GST 18%. Overhead starts at the rate master's value. They are placeholders an estimator is expected to overwrite, not company policy. Validation in section 1b | Decided, **please confirm** |
| F-23 | **Upper limits on percentages**, to catch typing slips (100 for 10): scrap 50%, overhead 100%, markup 200%, GST 40%. A value above a limit is rejected with a message; the limits are named constants in `src/lib/cost-engine/limits.ts` | Decided, **please confirm** |

### 1b. Validating the markup and scrap defaults (F-22, F-23)

What could and could not be checked:

- **Markup 10%.** The 30 seeded past quotes were repriced with the engine at the default inputs
  (net weight taken as 85% of gross, 10,000 pieces a year, no setup or tooling, overhead at
  the master rate). Their prices sit between −2% and +25% over engine cost, median +5%. So
  10% is inside the range of what the demo history shows. The seed prices are invented, so
  this is a sanity check of the arithmetic and not evidence about Company A's real pricing.
- **Scrap 2%.** Nothing in the data can confirm it: real scrap depends on the part and the
  process. It is a visible, editable input with a hint, and a tier table that shows its effect.
- **Limits.** The shipped defaults and the exact limits are covered by tests, and values just
  above each limit are rejected (`tests/cost-engine/tiers.test.ts`).
- **What would settle it:** ask the estimators what they use today and replace F-22 with those numbers.

### 1a. Scrap allowance and scrap recovery (F-10, in full)

Two separate things, both kept explicit:

- **Scrap recovery (from the brief, unchanged).** The metal that is machined away,
  `gross − net`, is credited back at the scrap recovery rate per kg.
- **Scrap allowance (added by you, F-10).** Scrap % is extra material bought to cover
  process losses, on top of gross weight.

```
kg bought        = gross × (1 + scrap % ÷ 100)
material / unit  = round( kg bought × rate per kg  −  (gross − net) × scrap recovery rate per kg )
```

Consequences, stated so they can be challenged:

1. **The allowance is not credited back.** Recovery is computed on `gross − net` only. The extra allowance kilograms are treated as fully lost. This is the conservative reading of "keep the existing recovery formula as specified". If some of the allowance is in fact recovered, the quote is slightly high.
2. Scrap % is entered as a number (3 means 3%), must be between 0 and 50 (limit F-23), and blank means 0.
3. Scrap % is **not** applied to conversion cost, overhead, total cost or markup.
4. Worked check: gross 0.61, net 0.50, rate ₹70, recovery ₹25, scrap 3% gives 0.61 × 1.03 × 70 − 0.11 × 25 = 43.981 − 2.75 = ₹41.23.

### 1b. Order of calculation (per unit, per tier)

```
material, conversion              computed once, same in every tier
setup + tooling_t   = round( (setup + tooling) / tier volume_t )
overhead            = round( overhead % × conversion )
total cost_t        = material + conversion + setup + tooling_t + overhead + packing + freight_t
markup_t            = round( markup % × total cost_t )
price per unit_t    = total cost_t + markup_t              (GST excluded)
GST_t               = round( GST % × price per unit_t )    (separate line)
annual value_t      = price per unit_t × tier volume_t     (GST excluded)
approval            = annual value at the 1× tier > ₹25,00,000
```

## 2. Money and rounding

| ID | Assumption | Status |
|----|------------|--------|
| M-01 | Money is computed with `decimal.js`, stored as Postgres `Decimal`, and written into JSON snapshots as strings, never floats | Decided |
| M-02 | Rounding is half-up to paise, applied once per cost component per unit (material, conversion, and so on). Within conversion, operations are summed unrounded and rounded once. Totals are sums of already-rounded components. Quantities and rates are never rounded | Decided |
| M-03 | Display uses Indian digit grouping, e.g. ₹ 1,25,000.00 | Given |

## 3. Approval

| ID | Assumption | Status |
|----|------------|--------|
| A-01 | Threshold is ₹25,00,000, held in one named constant | Given |
| A-02 | Annual value **above** the threshold needs sales_head approval; exactly ₹25,00,000 does not | Given |
| A-03 | sales_head can see everything and is the only role that approves or rejects | Given |
| A-04 | Permissions live in one map (`src/lib/auth/permissions.ts`). Estimator: create and edit RFQs, save and submit quotes, run imports, view rates; estimators never approve or send. Sales head: view everything, approve or reject, **send every quote** (approved ones, and ones that need no approval), and **add rate versions** (rate masters are a commercial decision, so estimators cannot change them). The brief does not say who maintains rates | Decided, **please confirm** |
| A-05 | The sales_head does not create RFQs or cost parts, because the brief gives that to the estimator. Say so if the sales head should also be able to | Decided |

### 3a. Who can do what (permission matrix)

Source of truth: `src/lib/auth/permissions.ts`; the server checks it on every page, action and
route, and the UI only uses it to hide buttons. Tested in `tests/auth/permissions.test.ts`.

| Permission | Estimator | Sales head |
|------------|:---------:|:----------:|
| View RFQs, quotes, rates, past quotes | yes | yes |
| Create an RFQ (including from AI intake) | yes | no |
| Edit part values; Accept AI-filled values | yes | no |
| Save quote versions, submit for approval | yes | no |
| Send a quote that needs no approval | yes | yes |
| Approve or reject a quote | no | yes |
| Send an approved quote | yes | yes |
| Mark a sent RFQ won or lost | yes | no |
| Add a rate version | no | yes |
| Run a past-quote import | yes | no |
| Download a quote PDF | yes | yes |

| ID | Assumption | Status |
|----|------------|--------|
| A-06 | **Any estimator can edit any RFQ**, not only their own. The brief names no ownership rule, and an estimator on leave must not block a quote. `Mine` on the register is a filter, not a permission | Decided, **please confirm** |
| A-07 | Only the sales head sends. A quote above the threshold can never be sent until it is approved; one at or below it goes draft, then ready to send, then sent, with no approval step. The database also refuses any other status move, so a draft can never jump to sent | Given (client brief: the sales head approves and sends) |
| A-08 | A rejected quote cannot be revived. The estimator saves a new version, which starts as a draft | Decided |
| A-09 | Saving after a submit creates a new version; the submitted one is never changed. Only the latest version can be sent | Decided |
| A-10 | RFQ status moves only forward: estimating → sent (when its quote is sent) → won or lost. Lost needs a reason (also a database CHECK) | Decided |
| A-12 | An RFQ's customer, due date and parts can be edited only while it is `estimating`. Once its quote is sent (or won or lost) they are locked. A part with saved quote versions cannot be removed, and an RFQ keeps at least one part and at most 20 | Decided |
| A-13 | Part values (material, weights, volume) stay editable on the costing screen after a send, because saving a new version is allowed (A-09). Saved versions keep their own copy of the inputs, so editing a part never changes an earlier quote | Decided |
| A-11 | Every decision (submit, approve, reject, send, won, lost) writes an audit row with who and when | Decided |

## 4. Versioned rates

| ID | Assumption | Status |
|----|------------|--------|
| R-01 | Rate rows are never edited or deleted. Adding a rate adds a row. Enforced by database triggers, not only by the app | Given, enforced in `20261102000002_integrity_constraints` |
| R-02 | Lookup returns the row with the latest `effectiveFrom` that is on or before the quote date, per material or machine | Given |
| R-03 | A rate whose date equals the quote date applies (on-or-before, inclusive) | Decided |
| R-04 | Adding a rate for a code that already has a row on the same effective date is rejected with a clear message; choose a later date | Decided |
| R-05 | The quote date defaults to today and the estimator may change it. It is not locked | Decided |
| R-06 | Overhead % has one category, `STANDARD`; the column exists so more can be added | Decided |
| R-07 | Dates are calendar dates (Postgres `DATE`), evaluated in India time (IST) | Decided |
| R-08 | A new rate may start at most 366 days before or after today, which catches typos such as 2062. Past dates are allowed so a missed update can be recorded | Decided |
| R-09 | Rate masters show every version per code, newest first, marked current, scheduled or superseded. There is no edit or delete control anywhere | Decided |

## 5. AI intake

| ID | Assumption | Status |
|----|------------|--------|
| I-01 | Only RFQ email text, Excel rows and drawing title-block text go to the AI. Never drawing images or files | Given |
| I-02 | With no `LLM_API_KEY` the app uses a mock provider, and the UI and docs say so | Given |
| I-03 | Source and accepted-flag per pre-filled value live in a `PartField` table, not a JSON column | Decided |
| I-04 | Routing suggestions come from past quotes (same material, weight band), never from the LLM | Given |
| I-05 | The weight band used to find similar parts is defined in Phase 7. The seed data and its test assume a band of ±25% of gross weight | *(Phase 7)* |
| I-06 | Past-quote import files use eight columns: `customer, part_name, material, gross_weight_kg, routing, price_per_unit, quote_ref, quoted_on`. Routing is `operation:machine:minutes` with steps separated by `;`. The brief does not fix a file layout | Decided, may change in Phase 8 |
| I-13 | RFQ numbers are allocated under a Postgres advisory lock inside the creating transaction, so simultaneous creations take consecutive numbers instead of colliding | Decided |
| I-14 | Weights accept up to 999999.9999 kg (the database column is NUMERIC(10,4)); anything larger is refused with a message instead of failing in the database | Decided |
| I-08 | New RFQs get numbers `RFQ-YYMM-NNN`, counted within the month. Gaps are fine, duplicates are rejected by a unique constraint | Decided |
| I-09 | "Similar past quote" means the same material and a gross weight within ±10%, closest first. (Assumption I-05's ±25% was for seed data only and is replaced by this) | Decided |
| I-10 | **Nothing from the extractor is trusted.** A value is kept only if its quoted evidence appears in the email and it has the right shape. Dropped values are listed as warnings. Kept values stay unaccepted until a person accepts them | Decided |
| I-11 | A failing real provider shows an error and the manual form. It never falls back silently to the mock | Decided |
| I-12 | Import runs in two steps: check (nothing saved, every bad row listed with its line and reason), then save the good rows. Re-uploading the same file adds nothing. One bad row never blocks the rest | Decided |
| I-07 | **Every pre-filled value that is not typed by a person (source email, excel or title block) counts as AI-filled and needs Accept**, including values read from Excel cells, because those rows also pass through the extraction step. Manual entries are accepted on entry | Decided |

## 5a. Customer PDF

| ID | Assumption | Status |
|----|------------|--------|
| Q-01 | The PDF shows what the customer needs: price per unit, GST and annual value for each volume, validity and terms. The per-piece cost breakup is covered by Q-04. Markup percentage, machine hour rates, scrap and recovery, approval notes and audit information are left out on purpose | Decided |
| Q-02 | A quote is valid for 30 days from its quote date. The terms text is generic placeholder wording for Company A to replace | Decided |
| Q-03 | A PDF is issued only once the sales head has sent the quote (`canIssuePdf`). A draft, pending, approved, ready-to-send or rejected quote returns 409 | Decided (client brief: sending enables the customer PDF) |
| Q-04 | The customer PDF carries a per-piece cost breakup per volume tier: material, conversion, setup and tooling, overheads, packing and freight, then the quoted unit price, GST separately, unit price including GST and annual value (excluding GST). Every figure is copied from the saved snapshot, never recalculated. These lines add up to less than the unit price: the difference is our markup, which is stated as "not itemised" and never shown as a percentage or amount. The client asked for a cost breakup but not which lines the customer may see, so showing no markup, hour rates or scrap is our choice | Decided, **please confirm** |

## 6. Platform choices

| ID | Assumption | Status |
|----|------------|--------|
| P-01 | Prisma is pinned to 6.x. The npm `latest` tag is currently an 8.0 release candidate and 7.x changes the config model; a take-home should not sit on a release candidate | Decided |
| P-02 | Plan is 8 working days, as proposed in Phase 0 | Decided |
| P-03 | Inter is self-hosted through `@fontsource-variable/inter` so builds need no network | Decided |
| P-04 | Prisma uses the Rust-free client (`engineType = "client"`) with `@prisma/adapter-pg`. No schema or behaviour change; it avoids a native engine download and runs on Vercel. `DATABASE_URL` is used by the app and `DIRECT_URL` by migrations | Decided |
| P-05 | Next.js 16 `proxy.ts` (the renamed middleware) blocks signed-out requests first; the server-side guard is still called on every page, action and route, so the proxy is a convenience and not the only protection | Decided |

## 6a. Security and sessions

| ID | Assumption | Status |
|----|------------|--------|
| S-01 | Sign-in is limited to 5 failed attempts per email per 15 minutes. The counter is in memory, so on serverless hosting each instance counts separately: it slows guessing but is not a hard global limit. A shared store is the next step | Decided |
| S-02 | Sessions are JWTs that last 8 hours (one working day), then the user signs in again | Decided |
| S-03 | Wrong email and wrong password give the same message, and an unknown email still costs a full bcrypt check, so neither the answer nor the timing reveals which emails exist | Decided |
| S-04 | Passwords are hashed with bcrypt, cost 12. The demo passwords are for local and demo use only and must be changed on any real deployment | Decided |

## 6b. RFQ register

| ID | Assumption | Status |
|----|------------|--------|
| O-01 | An RFQ is **overdue** when its status is `estimating` and its due date is before today in India time. Due today is not overdue. Sent, won and lost RFQs are never overdue | Decided |

## 7. Seed data

Values from the brief are marked **Given**; everything else is invented to be plausible and
is an **ASSUMPTION**. None of it is real Company A data. The same marks appear in
`prisma/seed-data.ts`. Dates are relative to the day the seed runs, so the overdue RFQ
stays overdue; rate dates are fixed.

### Users
| Item | Value |
|------|-------|
| Estimator | `estimator@quotedesk.example` (fake address) |
| Sales head | `saleshead@quotedesk.example` (fake address) |
| Passwords | Demo only, listed in `deployment.md` |

### The three sample RFQs
| | RFQ-2611-014 | RFQ-2611-019 | RFQ-2611-023 |
|---|---|---|---|
| Customer | Company B (Given) | Company C (Given) | Company D (Given) |
| Part | Rear wheel spindle (Given) | Hydraulic lift arm (Given) | Gear blank (Given) |
| Material | EN8 (Given) | 40Cr4 forging (Given) | 20MnCr5 (Given) |
| Gross weight | 0.61 kg (Given) | 4.60 kg (Given) | 1.48 kg (Given) |
| Annual volume | 180000 (Given) | 24000 (Given) | 60000 (Given) |
| Routing | 3.2 min, CNC-T1 (Given) | 11.5 min, VMC-1 (Given) | 4.8 min, CNC-T2 (Given) |
| Hour rate | ₹850 (Given) | ₹1450 (Given) | ₹950 (Given) |
| Net weight | 0.52 kg **ASSUMPTION** | 3.90 kg **ASSUMPTION** | 1.20 kg **ASSUMPTION** |
| Setup / tooling | ₹50,000 / ₹1,50,000 **ASSUMPTION** | ₹1,20,000 / ₹4,50,000 **ASSUMPTION** | ₹80,000 / ₹2,00,000 **ASSUMPTION** |
| Due date | in 6 days **ASSUMPTION** | 4 days ago, overdue **ASSUMPTION** | in 12 days **ASSUMPTION** |

Machine efficiency is 1.0 on these three machines so the brief's own check (3.2 min at ₹850/hr = ₹45.33) reproduces exactly from the seeded rates.
The lift arm has two values from the email (material, annual volume) left unaccepted, so the accept gate can be demonstrated.

### Invented RFQs, to cover every state
| RFQ | Status | Purpose |
|-----|--------|---------|
| RFQ-2611-027, Company E, Throttle cable bracket, EN8, 0.18 kg, 6000/yr, 2.1 min on CNC-T3 | estimating | Small: about ₹4 lakh a year, far under ₹25 lakh, so the no-approval path can be shown |
| RFQ-2610-031, Company B, Brake pedal pin | sent | Past due but not overdue |
| RFQ-2610-008, Company C, Axle shaft | won | |
| RFQ-2609-044, Company G, Transmission gear blank | lost, "Lost on price: competitor quoted about 6% lower" | Lost with a reason |

With the default inputs used in the seed test (scrap 2%, packing ₹1.50, freight ₹2.00, markup 10%), the three sample RFQs all come out far above ₹25,00,000 a year, and the small one does not.

### Rate masters (all ASSUMPTION)
| Rate | Value | Effective |
|------|-------|-----------|
| EN8 material | ₹70/kg, scrap recovery ₹25/kg | 1 Apr 2026 |
| EN8 material, **second version** | ₹76/kg, recovery ₹27/kg | 1 Oct 2026 |
| 40Cr4 material | ₹84/kg, recovery ₹26/kg | 1 Apr 2026 |
| 20MnCr5 material | ₹78/kg, recovery ₹26/kg | 1 Apr 2026 |
| CNC-T1, VMC-1, CNC-T2 | ₹850, ₹1450, ₹950 per hour (Given), efficiency 1.00 | 1 Apr 2026 |
| CNC-T3 | ₹700/hr, efficiency 0.85 | 1 Apr 2026 |
| CNC-T3, **second version** | ₹740/hr, efficiency 0.85 | 1 Oct 2026 |
| DRL-1 drilling, GRD-1 grinding | ₹400/hr and ₹600/hr, efficiency 0.90 | 1 Apr 2026 |
| Overhead STANDARD | 11% | 1 Apr 2026 |
| Overhead STANDARD, **second version** | 12% | 1 Oct 2026 |

Today's quotes use the second versions; a quote dated before 1 October 2026 uses the first.

### Past quotes
30 invented past quotes (EN8 shafts and brackets, 40Cr4 forgings, 20MnCr5 gear blanks), with prices of roughly ₹150 to ₹300 per kg of finished weight.
`prisma/demo/past-quotes-demo.csv` holds the same 30 plus 5 deliberately broken rows
(missing material, non-numeric weight, negative price, impossible date, malformed routing)
for the import demo. Regenerate it with `npm run demo:csv`; a test fails if it drifts.
