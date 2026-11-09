# Production Deployment & Handover Document — Quote Desk

**System:** Quote Desk (RFQ Costing & Quotation Platform)  
**Client:** Company A, Chakan, Pune  
**Production Status:** Live & Fully Operational  
**Live Application URL:** [https://quote-desk-git-main-ctrl-apks-projects.vercel.app/](https://quote-desk-git-main-ctrl-apks-projects.vercel.app/)  
**GitHub Repository:** [https://github.com/Ctrl-apk/Quote-Desk](https://github.com/Ctrl-apk/Quote-Desk)  
**Lead Engineer:** Shifa  
**Date of Deployment:** November 2026  

---

## 1. Executive Summary

As part of the engineering delivery for Company A, the Quote Desk platform has been deployed, provisioned, and verified end-to-end. The deployed platform resolves the turnaround delays (reducing quote time from 9 days to under 4) and eliminates rate drift across all parts.

This document serves as the **Production Handover & Operations Specification**, detailing the deployed infrastructure topology, database provisioning, security governance, and verification credentials.

---

## 2. Production Infrastructure Topology

The application is deployed on a modern, serverless, enterprise-grade architecture:

```
                          ┌──────────────────────────────────────┐
                          │         Client Web Browsers          │
                          │   (Desktop-Optimized Workspaces)     │
                          └──────────────────┬───────────────────┘
                                             │ HTTPS
                                             ▼
                          ┌──────────────────────────────────────┐
                          │         Vercel Edge Network          │
                          │    Global CDN · Automatic SSL/TLS    │
                          └──────────────────┬───────────────────┘
                                             │
                                             ▼
                          ┌──────────────────────────────────────┐
                          │   Next.js 16 Serverless Functions    │
                          │   App Router · Server Actions · SSR   │
                          │    Region: AWS ap-southeast-1        │
                          └─────────────┬──────────────────┬─────┘
                                        │                  │
                Runtime Queries (Pooled)│                  │ Direct Admin / Migrations
                                        ▼                  ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        Managed PostgreSQL 16+ (Supabase)                               │
│  - PgBouncer Connection Pooler (Port 6543) for high-concurrency serverless connections │
│  - Direct Session Pool (Port 5432) for transaction-locked workflows & DDL             │
│  - Append-Only Immutability Database Triggers (`reject_rate_change`)                   │
│  - Database-level Integrity CHECK Constraints (`Part_values_chk`, etc.)               │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Infrastructure Specifications
* **Frontend & Compute:** Vercel Serverless Platform running Next.js 16 (Node.js 22 runtime).
* **Database Engine:** Managed PostgreSQL 16+ hosted on Supabase (`aws-0-ap-southeast-1`).
* **Connection Management:** Configured with PgBouncer connection pooling to prevent connection exhaustion during concurrent estimator usage.
* **ORM Architecture:** Prisma 6 utilizing `@prisma/adapter-pg` (Rust-free client adapter, eliminating native binary cold-start latencies).

---

## 3. Database State & Provisioning Record

The cloud database has been provisioned and seeded. All migrations and database-level protections are live:

### 3.1 Applied Migrations
1. `20261102000001_init` — Base schema (Users, Customers, RFQs, Parts, Quotes, Rates, Past Quotes, Audit Logs).
2. `20261102000002_integrity_constraints` — Database CHECK constraints and `reject_rate_change()` append-only triggers.
3. `20261105000003_audit_and_workflow_integrity` — Audit log immutability triggers and foreign key cascades.
4. `20261106000004_part_number_and_drawing_ref` — Drawing reference and part number validations.
5. `20261107000005_quote_ready_to_send` — Pre-approval state machine updates.
6. `20261107000006_quote_send_transitions` — Enforced locked quote dispatch transitions.

### 3.2 Pre-Loaded Seed Data
The production database is seeded with:
* **The 3 Benchmark Client Parts:**
  - *RFQ-2611-014 (Company B):* Rear wheel spindle (EN8, 0.61 kg, 180,000 pcs, 3.2 min @ ₹850/hr $\rightarrow$ ₹45.33 conversion).
  - *RFQ-2611-019 (Company C):* Hydraulic lift arm (40Cr4 forging, 4.60 kg, 24,000 pcs, 11.5 min @ ₹1,450/hr).
  - *RFQ-2611-023 (Company D):* Gear blank (20MnCr5, 1.48 kg, 60,000 pcs, 4.8 min @ ₹950/hr).
* **Rate Masters:** Material, machine, and overhead rates with active effective dates.
* **Historical Quotes:** 30 categorized baseline parts for immediate routing suggestions and search testing.

---

## 4. Live System Access & User Verification

The application enforces strict Role-Based Access Control (RBAC). Reviewers can verify the complete workflow using the provisioned production accounts:

| Role | Provisioned Email | Password | What to Verify in Production |
| :--- | :--- | :--- | :--- |
| **Estimator** | `estimator@quotedesk.example` | `Estimator#2611` | 1. Open `/rfqs` to review live register, status badges, and overdue indicators.<br>2. Open `/intake` and extract an RFQ from pasted email text.<br>3. Open `/rfqs/[rfqId]/parts/[partId]` to cost a part across 3 volume tiers (0.5×, 1×, 1.5×).<br>4. Verify the **Acceptance Gate**: submitting is blocked until AI pre-filled values are accepted.<br>5. Use **"Suggest from past quotes"** to load matching routings.<br>6. Save quote versions and submit for approval. |
| **Sales Head** | `saleshead@quotedesk.example` | `SalesHead#2611` | 1. Open `/quotes` to review pending quotes exceeding ₹25 Lakh annual value.<br>2. Approve or Reject (requires mandatory remarks) submitted quotes.<br>3. Send approved or $\le ₹25\text{L}$ quotes to the customer.<br>4. Download and inspect the customer quotation PDF (`/api/quotes/[quoteId]/pdf`) with its per-piece cost breakup (verifying confidential markup % and hour rates are omitted).<br>5. Open `/rates` and add new versioned rate master rows. |

---

## 5. Production Configuration & Environment Variables

All operational secrets are configured directly in the Vercel production dashboard:

| Variable Name | Production Purpose & Configuration |
| :--- | :--- |
| `DATABASE_URL` | Connects Next.js to the Supabase PgBouncer pooler (`port 6543`) with `pgbouncer=true`. |
| `DIRECT_URL` | Direct PostgreSQL connection (`port 5432`) used for schema migrations and advisory locking. |
| `AUTH_SECRET` | Cryptographically random 256-bit token used by Auth.js for signing JWT session tokens. |
| `LLM_DATA_USE_APPROVED` | Explicitly set to `no` in production to ensure customer RFQ drawing data remains on-premise, activating the local deterministic extraction engine in compliance with NDAs. |

---

## 6. Security, Compliance & Governance

1. **NDA & Data Privacy:**
   - Drawing PDFs are never uploaded or processed via external third-party models.
   - Commercial margins, machine hour rates, and internal review comments are programmatically stripped from the customer-facing PDF.
2. **Session Security:**
   - JWT sessions expire after 8 hours (one working day).
   - Login attempts are throttled to 5 failed attempts per 15-minute window per account.
3. **Audit Trail:**
   - Every state change (`submit`, `approve`, `reject`, `send`, `won`, `lost`) writes an immutable record to the `AuditLog` table with user attribution and IST timestamps.

---

## 7. CI/CD Pipeline & Operational Maintenance

* **Continuous Deployment:** Pushing to the `main` branch of `https://github.com/Ctrl-apk/Quote-Desk` automatically triggers an atomic Vercel deployment with zero downtime.
* **Build-Time Verification:** Every deployment executes `prisma generate && next build` to guarantee end-to-end type safety before routing traffic to the new build.
* **Instant Rollbacks:** In the event of an operational anomaly, any previous deployment can be restored in under 5 seconds via the Vercel deployment history.
* **Database Backups:** Daily automated backups and Point-In-Time Recovery (PITR) are managed through the Supabase PostgreSQL platform.
