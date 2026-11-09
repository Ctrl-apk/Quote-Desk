# Technical design notes

Raw material for the Technical Design Document. Written phase by phase; sections marked
*(later)* are filled in when that part is built.

## 1. Architecture and why

Dependencies point one way: **UI → server actions and routes → services → pure libs and repositories.**

- `src/lib/cost-engine` and `src/lib/rates` are pure TypeScript with no Prisma, Next or
  React imports. That is what makes the costing fully unit-testable and keeps AI out of
  the arithmetic by construction.
- Only repositories touch Prisma. Services hold business rules (approval gate, "unaccepted
  AI values block submit"). Server actions are thin: `zod parse → role guard → service`.
- Every route and action calls one `guard` module, so role checks are not scattered.

Why Next.js App Router with server actions: one deployable on Vercel, server-side checks
sit next to the UI that needs them, and the PDF can render on the server.

## 2. Data model

See `prisma/schema.prisma`. Decisions worth defending:

- **Decimal money everywhere.** Floats cannot represent paise reliably. Snapshots store values as strings.
- **Rate tables are append-only, enforced twice.** The repository exposes no update or
  delete, and database triggers reject `UPDATE` and `DELETE`. A bug in app code still
  cannot rewrite history. `(code, effectiveFrom)` is unique, so same-day duplicates fail.
- **Quotes carry their own evidence.** `rateRowIds` points at the exact rows used and
  `ratesSnapshot` holds their values, so a quote survives later rate changes even in
  the unlikely case a row were removed.
- **`PartField` holds provenance.** One row per pre-filled field with `source`, `aiFilled`
  and `accepted`. "Any unaccepted AI value blocks submit" becomes a single indexed query.
- **CHECK constraints for invariants** (net ≤ gross, efficiency in (0,1], lost needs a reason),
  so bad data is rejected even if a code path forgets to validate.
- `PastQuote.importKey` is a hash, which makes re-uploading the same Excel file idempotent.

## 3. Main flows

**Sign-in and access.** The proxy sends signed-out requests to /sign-in. Credentials are
validated with zod, the email is rate-limited, and the password is checked with bcrypt
(a full hash even for unknown emails). The session is a signed JWT carrying the role. Every
page, server action and API route then calls the guard (`requirePageUser` or
`requirePermission`), which maps role to permission in one table. The proxy is a
convenience; the guard is the control.

**Pricing a part.** Inputs and looked-up rates go into
`calculateQuoteCost`, a pure function that returns the three volume tiers and whether the
pre-GST 1x annual value passes ₹25,00,000. Nothing in that path touches the database or AI.

**Quote lifecycle.** An estimator saves versions (each is immutable, with the inputs, the rate
rows used and the computed tiers). Submitting the latest version puts it in `pending_approval` (above
₹25,00,000 pre-GST at 1×) or `ready_to_send` (at or below). The estimator never sends. The sales head
approves or rejects pending quotes (rejection needs a reason) and then sends; they also send
`ready_to_send` quotes directly. Sending moves the RFQ to `sent` and enables the customer PDF; later
the RFQ is marked won or lost (lost needs a reason). A database trigger allows only these moves, so
draft to sent is impossible even by hand. Every step is
decided by a pure function in `src/lib/quote`, applied by a service inside one transaction whose
`WHERE status = …` makes a double click or a race a no-op, and logged to `AuditLog`.

**Customer PDF.** Rendered on the server with `@react-pdf/renderer` from `buildPdfContent`, which
selects only customer-safe fields. The route checks the role and `canIssuePdf(status)`.

## 4. How the AI part works and what happens when it is wrong

The app depends on one interface, `ExtractionProvider`. Without `LLM_API_KEY` the labelled mock
provider (patterns, not intelligence) is used; with a key, the Anthropic provider is used. Either
way the output is untrusted: `verifyExtraction` keeps a value only if its quoted evidence appears
verbatim in the email and the value has a valid shape (weights positive, net ≤ gross, a real
volume, a plausible due date). Dropped values are shown as warnings. Everything kept is saved as
unaccepted and **blocks submit until a person accepts it**; the cost engine never sees AI output
except through those accepted, typed values. If the real provider times out or answers badly the
screen shows the error and the manual form; it never quietly switches to the mock. Routing
suggestions come from past quotes, not the model.

## 5. Key screens and design reasoning

**Sign-in** is one column, two fields, one message for any failure, so it reveals nothing
about which accounts exist. **RFQ list** is a plain table with thin dividers, outlined text
badges for status and a single warning-coloured "Overdue" badge, so the one thing needing
attention is the only coloured thing. On a phone the table scrolls inside its own wrapper
rather than breaking the page. Every route group has loading, error and empty states.

The design system is Watermelon UI / shadcn primitives with Motion. Tokens live in one file
(`src/styles/tokens.css`) and are mapped onto Tailwind once: warm ivory surface, forest green
primary, copper accent, Inter with tabular numerals. Layout follows the Gridline dashboard: a
sidebar, a top bar showing the rates date and approval threshold, cards and rounded tables.
Motion is limited to page fades, table-row entrance, dialogs and a 250 ms number tween on the
costing table; `MotionConfig reducedMotion="user"` plus an explicit check keep it off for people
who ask. The costing screen is three panes (part, routing and assumptions, price) with a sticky
price bar on phones. Every route has loading, error and empty states.

**RFQ management.** Create, edit, add, rename and remove parts run as one transaction each. They
lock the RFQ row (`SELECT … FOR UPDATE`) and check `canEditRfq` inside the lock, so an edit and a
submit for the same RFQ cannot interleave. RFQ numbers are taken under a Postgres advisory lock.

**Testing layers.** Pure logic and services (mocked repositories) run in `npm test` with no database.
`npm run test:integration` runs the same services against a throwaway Postgres to prove what mocks cannot:
triggers, constraints, rollback and concurrent requests.

## 6. What was cut

- Dark mode (tokens are ready for it; not built).
- Email sending: "Send" marks the quote sent and enables the PDF; it does not email anyone.
- Multi-part RFQs on the costing screen are supported by the data model; the register opens the first part.
- A shared login throttle store (per-instance memory today).

## 7. What to do next

1. Confirm F-22 defaults and A-04 / A-06 with the estimators and sales head.
2. Run `prisma migrate deploy` on a normal network and confirm no drift.
3. Replace the placeholder PDF terms and the seeded demo data.
4. Deploy (see `deployment.md`), with a shared rate-limit store.

## 8. Honest limitations

- Prisma's engine binaries could not be downloaded in the build sandbox. The Rust-free client
  runs through the pg adapter and was exercised against Postgres 18, and `db:init` creates a
  fresh database from the committed SQL with Prisma-compatible records. Prisma's own `migrate`
  command has not been run, so a first `npm run db:deploy` on a normal machine is the real
  confirmation (it should report nothing to apply after `db:init`).
- The real LLM provider is tested with a mocked HTTP layer only; no live API call was made.
- Seed numbers are invented and labelled; only the brief's values are real. Markup and scrap
  defaults could only be sanity-checked against invented history (assumptions 1b).
- The login throttle is per server instance.
- Not deployed.
