# Deployment Guide — Quote Desk

**Live Deployed Application:** [https://quote-desk-git-main-ctrl-apks-projects.vercel.app/](https://quote-desk-git-main-ctrl-apks-projects.vercel.app/)  
**GitHub Repository:** [https://github.com/Ctrl-apk/Quote-Desk](https://github.com/Ctrl-apk/Quote-Desk)  
**Project:** RFQ-to-Quote Costing Platform for Company A (Chakan, Pune)

---

## 1. Architecture Overview

Quote Desk is designed to run serverlessly on **Vercel** with a hosted PostgreSQL instance (e.g. **Supabase** or **Neon**).

* **Web & API:** Next.js 16 (App Router) on Vercel.
* **Database:** PostgreSQL 16+ with native connection pooling (PgBouncer/Supabase Pooler).
* **ORM:** Prisma 6 with `@prisma/adapter-pg` (Rust-free, driver-adapter engine).

---

## 2. Environment Variables

Configure these variables in your Vercel project settings or in your local `.env`:

| Variable | Required | Description | Example |
| :--- | :---: | :--- | :--- |
| `DATABASE_URL` | **Yes** | Pooled PostgreSQL connection string for runtime queries | `postgresql://postgres...:6543/postgres?pgbouncer=true` |
| `DIRECT_URL` | **Yes** | Direct connection string for Prisma migrations & setup | `postgresql://postgres...:5432/postgres` |
| `AUTH_SECRET` | **Yes** | 32+ character random string for Auth.js JWT signing | Generate via `openssl rand -base64 32` |
| `AUTH_URL` | No | Public deployment URL (leave blank on Vercel; set to `http://localhost:3000` locally) | `http://localhost:3000` |
| `LLM_API_KEY` | No | Anthropic/OpenAI API key (leave empty to use local rule-based extractor) | `sk-ant-...` |
| `LLM_DATA_USE_APPROVED` | **Yes** | Must be `yes` to send data to external LLM under customer NDAs; default `no` | `no` |
| `LLM_MODEL` | No | Model name when external LLM is enabled | `claude-3-5-sonnet-latest` |
| `LLM_TIMEOUT_MS` | No | Extractor timeout in milliseconds | `10000` |
| `TEST_DATABASE_URL` | No | Dedicated throwaway DB for `npm run test:integration` (name must contain `test`) | `postgresql://.../quotedesk_test` |

---

## 3. Database Bootstrap & Migrations

All 6 migrations and PostgreSQL triggers are committed to `prisma/migrations`.

### Option A: Cloud Database Setup (Supabase / Neon)
Run from your local terminal pointing at your cloud database:
```powershell
# Windows PowerShell:
$env:DATABASE_URL="your-pooled-database-url"
$env:DIRECT_URL="your-direct-database-url"

# Run migrations (via native pg driver, bypassing Prisma engine downloads) and seed:
npx tsx --env-file=.env scripts/db-init.ts
npx tsx --env-file=.env prisma/seed.ts
```

### Option B: Local PostgreSQL
```bash
createdb quotedesk
cp .env.example .env
# Edit .env with your local credentials
npm run db:setup
```

---

## 4. Deploying to Vercel

1. Push your code to GitHub: `https://github.com/Ctrl-apk/Quote-Desk`.
2. In the Vercel Dashboard, click **Add New Project** $\rightarrow$ Import `Ctrl-apk/Quote-Desk`.
3. Framework Preset: **Next.js** (Root Directory: `./`).
4. Add Environment Variables:
   - `DATABASE_URL` (Supabase/Neon pooled URL)
   - `DIRECT_URL` (Supabase/Neon direct URL)
   - `AUTH_SECRET`
   - `LLM_DATA_USE_APPROVED` = `no`
   - *(Note: Do NOT set `AUTH_URL=http://localhost:3000` on Vercel; Auth.js detects the Vercel domain automatically).*
5. Click **Deploy**.

---

## 5. Demo Credentials

The database seed (`prisma/seed.ts`) provisions two role accounts with pre-configured permissions:

| Role | Email | Password | Responsibilities |
| :--- | :--- | :--- | :--- |
| **Estimator** | `estimator@quotedesk.example` | `Estimator#2611` | Ingest RFQs, review & accept AI fields, cost parts across 3 tiers, submit quotes, import past quotes. |
| **Sales Head** | `saleshead@quotedesk.example` | `SalesHead#2611` | Review and approve/reject quotes ($> ₹25\text{L}$), send quotes to customers, add rate versions. |

*Security Note: Failed login attempts are throttled to 5 tries per 15 minutes per email.*
