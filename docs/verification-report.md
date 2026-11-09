# Verification report (2026-11-07, final pass plus two corrections)

Everything here was run in the build sandbox against a local Postgres 18 (an embedded instance,
not a hosted database), using the production build (`next build` then `next start`). Nothing is
deployed and no hosted infrastructure was used.

## Commands and actual results (final commit)
| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | exit 0 |
| `npx eslint .` | exit 0, no findings |
| `npm test` (unit) | 45 files, 581 tests passed |
| `npm run test:integration` (real Postgres) | 5 files, 72 tests passed |
| `next build` | compiled; 14 routes listed |
| `npm run db:setup` on an empty database | applied 6 migrations, seeded; a second `db:init` reports "Database is up to date" |
| Browser acceptance (25 steps, Chromium, fresh database, production build, app restarted mid-run) | 81 of 81 checks passed |
| Layout: 9 screens x 4 widths (375, 768, 1024, 1280) x 2 roles | 64 combinations, 0 with horizontal overflow |
| Dialogs at 375x667 (Edit RFQ, Add part, Submit, Add rate, Approve, Reject) | 6 of 6 fit the screen after the fix below |

Not run: Prisma's own `migrate deploy` (its engine download is blocked here), the real LLM
provider (mocked HTTP only), anything on a hosted database.

The integration tests need `TEST_DATABASE_URL` in the environment (vitest does not read `.env`);
without it they fail loudly rather than skip.

## Two corrections in this round
1. **Customer PDF cost breakup.** The PDF now has a per-piece table for each volume tier: material, conversion, setup and tooling, overheads, packing and freight, quoted unit price, GST (separate), unit price including GST and annual value (excluding GST). All figures come from the saved snapshot. It never shows the markup percentage, machine hour rates, scrap or recovery, approval comments or audit data. The itemised lines add up to less than the unit price; the PDF says the commercial margin is "not itemised" (assumption Q-04).
2. **Sales head sends.** Submitting now gives `pending_approval` (annual value above Rs25,00,000 pre-GST at 1x) or `ready_to_send` (at or below). The estimator no longer has `quote:send`. The sales head approves or rejects, then sends; the sales head also sends `ready_to_send` quotes with no approval step. Sending moves the RFQ to Sent and enables the PDF (an approved but unsent quote returns 409). A new enum value and trigger (migrations 5 and 6) make the database refuse draft-to-sent and any other move; sending is one locked transaction.

Evidence: integration tests cover one piece under, exactly at and one piece over the threshold, the sales head sending without approval, approve-then-send, the estimator being refused, simultaneous duplicate sends (one winner, one audit row), sending a superseded version, and the trigger refusing illegal moves. Unit tests cover the PDF content against the snapshot. The browser run checked the rendered PDF with `pdftotext`: all 21 breakup figures (3 tiers x 7) equal the saved snapshot, and the text contains no markup, hour rate, approval or audit wording.

Known consequence: sending one part's quote marks the whole RFQ Sent and locks it, so the other parts of that RFQ become read-only. Cost every part before sending.

## Acceptance run (25 steps)
Estimator signs in; the register reads from Postgres, sorts and searches; an Excel part list with
the three client sample parts (and one bad row, reported with its line number) fills an RFQ with
three parts; email intake runs on the labelled local extractor with evidence per field and leaves
net weight empty; imported and email values show as unreviewed and block submit until accepted;
costing shows three tiers (90,000 / 180,000 / 270,000 pcs) with conversion (3.2/60) x 850 = 45.33,
material 44.86 and genuinely different unit prices (111.49 / 110.26 / 109.86); the quote is saved
and submitted; a second submit of the same version is blocked; the sales head reviews, approves
the spindle and rejects the lift arm (empty remarks blocked); the PDF is refused for the rejected
quote and for the approved-but-unsent one; the sales head sends it, and the PDF is then valid, names customer, RFQ, part, volumes and GST, shows the cost breakup, omits
markup and matches the stored snapshot; the 25,000 pcs x Rs100.00 quote (annual value exactly
Rs25,00,000.00) becomes ready to send, the estimator has no Send control, and the sales head sends it with no approval step, while 25,001 pcs (Rs25,00,100.00) needs approval and has no PDF; a new EN8 rate
is added with the approved quote unchanged and a new quote using the new rate; the synthetic
1,400-row workbook previews as 1,360 new / 25 with problems / 15 repeated, imports exactly 1,360
rows and importing again adds none; search works by part number, RFQ reference, customer, part
name, material and quotation date; a routing suggestion names its historical source and is not
applied; the app is stopped and restarted, and after a fresh login the RFQ, quotes, imported rows
and audit trail are all still there; unauthorised pages, controls and the PDF are refused.

## What the integration tests cover
Audit rows cannot be updated or deleted (trigger); rate rows are append-only; CHECK constraints;
a failed transaction leaves nothing behind; saving a version and a rate update never change an
earlier quote's snapshot; submit, approve, reject, send, won and lost each validate the current
state under a row lock; two simultaneous approvals or submissions give exactly one winner;
only the latest version can be submitted; rejection needs remarks; RFQ numbers stay unique
under simultaneous creation; RFQ edits are refused after a send and are serialised against a submit;
part edits and AI-value acceptance are audited; the 1,400-row import loses and duplicates nothing;
routing suggestions come from the closest past quote; the threshold boundary holds through a real
save and submit.

## Defects found and fixed in this pass
- Dialogs taller than a phone screen (Add part: 801 px on a 667 px screen) ran off both edges with no scroll, so fields and buttons could not be reached: dialogs now cap at the screen height and scroll inside.
- The acceptance run itself needed script fixes only (selectors, labels, waiting for streamed pages, port/`AUTH_URL`); none was a product defect.

## Earlier defects fixed (previous rounds)
- Scrap recovery above the material rate could make material cost negative: now rejected, with boundary tests.
- Audit table was not protected: trigger added.
- Approve/submit transitions were not atomic or concurrency-safe: now one locked transaction with state checks.
- No way to create or manage an RFQ by hand with several parts: `/rfqs/new` and `/rfqs/[rfqId]`.
- Simultaneous RFQ creation could run out of number retries: advisory-lock allocator.
- Weight validation allowed values the database rejects; part edits and AI acceptance were not audited; quote history showed raw action names; lint did not exist; XLSX import had no tests.

## Still incomplete or unverified
- Drawing PDFs are not read at all (no title-block extraction). Intake covers pasted email text and Excel/CSV part lists, and the screen says so.
- Email sending (Send only marks sent and unlocks the PDF).
- Prisma `migrate deploy` confirmation; deployment; a hosted database.
- A live call to the AI provider; without an API key the labelled mock runs, and live use needs `LLM_DATA_USE_APPROVED=yes` after a privacy check (see `.env.example`).
- Login throttle is per server instance. Dark mode not built.
- F-22 defaults (10% markup, 2% scrap) and A-04/A-06/A-12/A-13 are assumptions awaiting business confirmation.
- The 1,400-row dataset is synthetic (generated, labelled as such), not client data.
- Server-action role checks are proved by service and integration tests, not by forged browser requests.
