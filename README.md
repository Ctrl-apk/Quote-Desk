# Quote Desk ⚙️

> **Production-grade RFQ Costing & Quotation Platform** built for precision manufacturing Tier-1 suppliers (Company A, Chakan, Pune).
> Reduces quote turnaround from 9 working days to under 4, protects margins with versioned rate traceability, and automates RFQ extraction with human-in-the-loop validation.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.x-black.svg)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-336791.svg)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-6.x-2D3748.svg)](https://www.prisma.io/)
[![Vitest](https://img.shields.io/badge/Vitest-581%20unit%20%7C%2072%20db%20tests-green.svg)](https://vitest.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.x-38B2AC.svg)](https://tailwindcss.com/)

---

## 📌 Executive Summary & Business Impact

* **Client:** Company A, Chakan, Pune (320 staff, ₹140–160 Cr annual revenue, 6-person estimation team).
* **Domain:** Machined and forged parts for two-wheelers, tractors, and Tier-1 automotive customers.
* **The Problem:** 60 RFQs/month (5 parts each). Estimators spend 2.5 hours per part manually copying legacy rates. 9-day turnaround vs. 4-day customer expectation leads to a 5% loss of bids (36 RFQs/yr = ₹86.4 Lakh lost contribution) + ₹40.5 Lakh wasted estimator labor = **₹1.27 Crore annual loss**.
* **The Solution:** A dense, calm, desktop-first workspace delivering:
  1. Intake extraction from emails and Excel lists with human acceptance gates.
  2. Pure, deterministic 3-volume tier costing in under an hour per part.
  3. Database-enforced append-only rate master immutability.
  4. Search and routing suggestions from ~1,400 past quotes.
  5. Role-based approval workflow (> ₹25L) and automated customer-safe PDF generation.

---

## 🖥️ The 9 Shipped Screens

| # | Screen | Route | Target User | Key Capabilities |
|---|---|---|---|---|
| **1** | **RFQ Register** | `/rfqs` | Estimator / Sales Head | Real-time status cards (Estimating, Overdue, Sent, Closed), IST-aware overdue badges, search, sorting, and mandatory lost reasons. |
| **2** | **New RFQ** | `/rfqs/new` | Estimator | Manual multi-part creation or bulk ingestion of parts via Excel/CSV part lists. |
| **3** | **RFQ Detail** | `/rfqs/[rfqId]` | Estimator (edit) / Sales Head (view) | Add, edit, rename, and remove parts before quoting. Locked once sent or closed. |
| **4** | **Part Costing Workspace** | `/rfqs/[rfqId]/parts/[partId]` | Estimator (edit) / Sales Head (view) | 3 volume tiers (0.5×, 1× base, 1.5×), paise-exact conversion, scrap allowances, setup/tooling amortisation, live rate lookup, and acceptance gate. |
| **5** | **Quotes & Approval Register** | `/quotes` & `/quotes/[quoteId]` | Estimator / Sales Head | State machine workflow. Annual value > ₹25L (pre-GST, 1× tier) routes to Sales Head approval. Sales Head approves, rejects (with remarks), or sends. |
| **6** | **Customer Quotation PDF** | `/api/quotes/[quoteId]/pdf` | Estimator / Sales Head | Downloadable only after sending. Features itemised cost breakups per tier while strictly omitting confidential internal markups and hour rates. |
| **7** | **Rate Masters** | `/rates` | Estimator (view) / Sales Head (manage) | Material, machine, and overhead rates with effective dates. Database-enforced append-only versioning. |
| **8** | **AI Intake Desk** | `/intake` | Estimator | Extracts RFQ details from pasted customer emails with verbatim textual evidence. Extracted fields stay unreviewed until accepted. |
| **9** | **Past Quotes & Excel Importer** | `/past-quotes` | Estimator / Sales Head | Multi-filter historical discovery and 2-phase Excel/CSV import engine with line-by-line validation and cryptographic deduplication. |

---

## 📐 System Architecture

Dependencies flow unidirectionally from the presentation layer to pure, side-effect-free business logic:

```
┌────────────────────────────────────────────────────────┐
│              UI Layer (Next.js 16 App Router)           │
│     Desktop-dense · Tabular layout · Inter font numbers │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│           Server Actions & API Routes (Guarded)        │
│    Zod schema validation ➔ RBAC Guard ➔ Service Layer   │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│                    Service Layer                       │
│    State transitions · AI acceptance gates · Row locks │
└─────────────┬────────────────────────────┬─────────────┘
              │                            │
              ▼                            ▼
┌───────────────────────────┐ ┌──────────────────────────┐
│   Pure Mathematical Core   │ │   Persistence (Prisma)   │
│  `src/lib/cost-engine`    │ │  PostgreSQL 16+          │
│  `src/lib/rates`          │ │  Append-only DB Triggers │
│  Decimal.js · 0 external  │ │  CHECK Constraints       │
│  dependencies · Zero AI   │ │  Audit Log Immutability  │
└───────────────────────────┘ └──────────────────────────┘
```

---

## 🧮 Mathematical & Financial Engine

All financial calculations use `decimal.js` and round half-up to paise (₹ 0.01). Stored in Postgres as `Decimal`, never as IEEE-754 floats.

### 1. Material Cost per Unit
$$\text{Bought Weight} = \text{Gross Weight} \times \left(1 + \frac{\text{Scrap Allowance } \%}{100}\right)$$
$$\text{Material Cost} = \text{Bought Weight} \times \text{Rate/kg} - (\text{Gross} - \text{Net}) \times \text{Scrap Recovery/kg}$$
*Invariants:* $\text{Net Weight} \le \text{Gross Weight}$, and $\text{Recovery Rate} \le \text{Material Rate}$ (prevents negative material costs).

### 2. Conversion Cost per Unit
$$\text{Conversion Cost} = \sum_{i=1}^{n} \left(\frac{\text{Cycle Time (min)}_i}{60} \times \frac{\text{Hour Rate}_i}{\text{Efficiency}_i}\right)$$
*Benchmark Check:* Rear wheel spindle (3.2 min @ ₹850/hr, efficiency 1.0) = **₹ 45.33** per piece.

### 3. Setup & Tooling Amortisation (Multi-Volume Tiers)
$$\text{Setup + Tooling per Unit}_t = \text{round}\left(\frac{\text{Setup Cost} + \text{Tooling Cost}}{\text{Tier Volume}_t}\right)$$
Tiers are computed at $0.5\times$, $1\times$ (base), and $1.5\times$ of the annual volume, showing falling unit prices at higher volumes.

### 4. Overheads, Markup & Separate GST
* **Overhead:** Applied strictly to conversion cost: $\text{Overhead} = \text{Overhead } \% \times \text{Conversion Cost}$.
* **Markup:** Computed on total cost: $\text{Markup} = \text{Markup } \% \times \text{Total Cost}$ (explicitly labeled in UI as markup on cost, not gross margin).
* **GST:** Configurable (default 18%), calculated separately: $\text{GST} = \text{round}(\text{GST } \% \times \text{Price per Unit})$. Never embedded into price per unit.
* **Approval Trigger:** Pre-GST annual value at $1\times$ volume tier $> ₹25,00,000$.

---

## 🔒 Security, Traceability & NDA Governance

* **Append-Only Rate Masters:** Enforced at the database level via PostgreSQL triggers (`reject_rate_change`). Any attempt to `UPDATE` or `DELETE` existing rates raises a SQL exception.
* **Snapshot Immutability:** Every saved quote stores `rateRowIds` and a JSON `ratesSnapshot` of every rate used. Quotes are immune to subsequent rate changes.
* **Human-in-the-Loop Intake Gate:** Pre-filled values extracted from emails or Excel files are tracked in `PartField` with `aiFilled: true`. Submitting a quote is hard-blocked until an estimator accepts or manually modifies them.
* **Customer NDA Compliance:**
  * Drawing PDFs are **not** parsed with OCR or sent to external models.
  * Pasted RFQ email text stays local on-premise unless `LLM_DATA_USE_APPROVED=yes` is explicitly configured after reviewing vendor terms.
  * Customer-facing PDFs automatically suppress internal margins, machine hour rates, scrap recovery credits, and approver remarks.
* **Audit Trail:** Every status change (`save`, `submit`, `approve`, `reject`, `send`, `won`, `lost`) writes an immutable audit record with user ID, timestamp, and metadata.

---

## 🧪 Verification & Test Suite

The codebase has been verified with 100% pass rates across unit, database integration, and UI responsiveness suites:

```bash
# Run 581 unit tests (pure math, boundaries, formats, permissions)
npm test

# Run 72 integration tests (real PostgreSQL: triggers, row-locks, concurrency)
npm run test:integration

# Type check and linting (zero warnings permitted)
npm run typecheck
npm run lint
```

### Verified Sample Parts (Prompt Benchmark)
The test suite independently validates all three sample parts from the specification:
1. **RFQ-2611-014 (Company B) — Rear wheel spindle:** EN8, 0.61 kg, 180,000 pcs, 3.2 min @ ₹850/hr $\rightarrow$ Conversion = **₹ 45.33/pc**, Annual Value $> ₹25\text{L}$ (Approval Required).
2. **RFQ-2611-019 (Company C) — Hydraulic lift arm:** 40Cr4 forging, 4.60 kg, 24,000 pcs, 11.5 min @ ₹1,450/hr $\rightarrow$ Annual Value $> ₹25\text{L}$ (Approval Required).
3. **RFQ-2611-023 (Company D) — Gear blank:** 20MnCr5, 1.48 kg, 60,000 pcs, 4.8 min @ ₹950/hr $\rightarrow$ Annual Value $> ₹25\text{L}$ (Approval Required).

---

## 🚀 Getting Started Locally

### Prerequisites
* Node.js 22 or higher
* PostgreSQL database instance (local or hosted, e.g., Supabase / Neon)

### 1. Clone & Install
```bash
git clone https://github.com/Ctrl-apk/Quote-Desk.git
cd Quote-Desk
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Edit `.env` with your database credentials:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/quotedesk
DIRECT_URL=postgresql://user:password@localhost:5432/quotedesk
AUTH_SECRET=your-random-32-char-secret
AUTH_URL=http://localhost:3000
LLM_DATA_USE_APPROVED=no
```

### 3. Setup Database & Seed Demo Data
Applies all 6 SQL migrations via the native Postgres driver and seeds demo users, rates, sample RFQs, and past quotes:
```bash
# On Windows PowerShell:
npx tsx --env-file=.env scripts/db-init.ts
npx tsx --env-file=.env prisma/seed.ts

# Or with environment variables exported:
npm run db:setup
```

### 4. Start the Application
```bash
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🔑 Demo Credentials

| Role | Email | Password | Access |
|---|---|---|---|
| **Estimator** | `estimator@quotedesk.example` | `Estimator#2611` | Ingest RFQs, edit parts, accept suggestions, cost parts, submit quotes, import past quotes. |
| **Sales Head** | `saleshead@quotedesk.example` | `SalesHead#2611` | View all RFQs/quotes, approve/reject quotes ($> ₹25\text{L}$), send quotes, add versioned rate masters. |

---

## 📂 Project Structure

```
Quote-Desk/
├── prisma/
│   ├── schema.prisma              # Data models, enums & relations
│   ├── migrations/                # 6 committed migrations + triggers
│   ├── seed.ts                    # Idempotent seed script
│   └── demo/                      # synthetic-1400.xlsx & demo CSVs
├── scripts/
│   ├── db-init.ts                 # Native pg driver migration runner
│   └── migrate-sql.ts             # Migration discovery & hash checks
├── src/
│   ├── app/                       # Next.js 16 App Router (9 screens)
│   ├── components/                # UI primitives, costing grid, intake desk
│   ├── lib/
│   │   ├── cost-engine/           # Pure TS financial calculation core
│   │   ├── rates/                 # Append-only rate lookup & snapshots
│   │   ├── costing/               # Form state & validation
│   │   ├── import/                # Excel/CSV parser & validator
│   │   ├── intake/                # Email extractor & verification
│   │   └── quote/                 # PDF generator & workflow engine
│   └── server/                    # Repositories, service layers & actions
├── tests/                         # Vitest test suites (mirroring src/lib)
└── docs/
    ├── assumptions.md             # All 46 documented design decisions
    ├── TDD-notes.md               # Architecture & security defense notes
    └── verification-report.md     # Audit report & browser acceptance
```

---

## 📄 License & Attribution

* Built with [Watermelon UI](https://github.com/WatermelonCorp/watermellon-registry) and shadcn/ui primitives under the MIT License.
* Code & architecture authored for Company A RFQ costing challenge.
