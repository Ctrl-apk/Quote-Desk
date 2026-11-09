# Quote desk

RFQ-to-quote costing for Company A (Chakan, Pune). An estimator opens an RFQ with part
details pre-filled, finishes costing in about an hour, and every quote is traceable to the
exact rates it used.

> **Status: all screens built and verified locally (see `docs/verification-report.md`).** Sign-in and roles, RFQ register, part costing with three volume
> tiers, rate masters, quote review and approval, customer PDF, AI intake desk (labelled mock
> unless an API key is set) and past-quote import and search. `docs/assumptions.md` lists
> every decision and what is still open. Not deployed.

## Screens

| Screen | Path | Who |
|--------|------|-----|
| RFQ register | `/rfqs` | both |
| New RFQ (manual, several parts) | `/rfqs/new` | estimator |
| RFQ detail: edit, add, rename, remove parts | `/rfqs/[rfqId]` | estimator edits while estimating, sales head views |
| Part costing | `/rfqs/[rfqId]/parts/[partId]` | estimator edits, sales head views |
| Quotes and approval | `/quotes`, `/quotes/[quoteId]` | both; sales head approves or rejects and sends |
| Customer PDF | `/api/quotes/[quoteId]/pdf` | both; only after the sales head has sent the quote; includes a customer-safe cost breakup |
| Rate masters | `/rates` | both view; sales head adds versions |
| AI intake desk | `/intake` | estimator |
| Past quotes (import, search) | `/past-quotes` | both search; estimator imports |

Permissions are in `src/lib/auth/permissions.ts`; the matrix is in `docs/assumptions.md` section 3a.

## Stack

Next.js (App Router) · TypeScript 6 (pinned: typescript-eslint does not yet support 7) · Postgres + Prisma 6 · Auth.js · zod · Vitest ·
@react-pdf/renderer · Tailwind 4

## Run locally

1. Install Node 22 or later and have a Postgres database available.
2. `npm install`
3. `cp .env.example .env` and fill in the variable values (names are listed in `.env.example`). For a local Postgres, for example: `createdb quotedesk` and `DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/quotedesk`; `DIRECT_URL` can be the same value. Set `AUTH_URL` to the address you open in the browser (for `npm run dev` that is `http://localhost:3000`); sign-in redirects are built from it, so a different port sends signed-out visitors to the wrong address.
4. `npm run db:deploy` to apply the migrations. If Prisma cannot download its engine on your network, `npm run db:init` applies the same SQL with the plain Postgres driver and records it the way Prisma does, so `db:deploy` works afterwards.
5. `npm run db:seed` to load demo users, rates, RFQs and past quotes (safe to repeat). `npm run db:setup` does steps 4 (init variant) and 5 in one go on a fresh database.
6. `npm run dev`, open http://localhost:3000 and sign in with a demo login from `deployment.md`.

## Commands

| Command | What it does |
|---------|--------------|
| `npm test` | Unit tests (pure logic, services with mocked repositories); no database needed |
| `npm run test:integration` | Database tests: constraints, audit immutability, transactions, concurrency, RFQ management. Needs `TEST_DATABASE_URL` pointing at a throwaway local database whose name contains "test" (it wipes that database each run, and refuses any other name); it fails loudly without it |
| `npm run test:all` | Both of the above |
| `npm run typecheck` | TypeScript check with no emit |
| `npm run lint` | ESLint (Next.js core-web-vitals and TypeScript rules) |
| `npm run dev` | Dev server |
| `npm run build` | Generates the Prisma client and builds for production |
| `npm run db:deploy` | Applies committed migrations (Prisma) |
| `npm run db:init` | Same migrations through `pg`, for a fresh database when Prisma's engine is unavailable |
| `npm run db:setup` | `db:init` then `db:seed` |
| `npm run db:migrate` | Creates and applies a new migration during development |
| `npm run db:seed` | Loads demo data; running it twice adds nothing |
| `npm run demo:csv` | Regenerates the past-quote import demo file |

## Structure

Dependencies point one way: UI → server actions and routes → services → pure libs and repositories.

```
prisma/              schema, migrations, seed
docs/                assumptions, technical design notes
src/app/             routes and screens
src/components/      ui primitives and feature components
src/lib/             pure logic: cost-engine, rates, costing, quote, intake, import, format, auth
scripts/             database init that works without Prisma's engine
src/server/          db client, repositories, services, actions
src/styles/          design tokens
tests/               Vitest suites, mirroring src/lib
```

`src/lib/cost-engine` and `src/lib/rates` import nothing from Prisma, Next or React.
