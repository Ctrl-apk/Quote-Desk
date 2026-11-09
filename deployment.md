# Deployment

Target: Vercel plus a hosted Postgres. This file is completed in the final phase; the
parts below are already true.

## Environment variables (names only)

| Name | Purpose |
|------|---------|
| `DATABASE_URL` | Postgres connection string used by the app (pooled, if your host offers pooling) |
| `DIRECT_URL` | Direct Postgres connection used by `prisma migrate` |
| `AUTH_SECRET` | Auth.js signing secret. Generate one with `npx auth secret` or `openssl rand -base64 32` |
| `AUTH_URL` | Public URL of the deployment |
| `LLM_API_KEY` | Optional. Leave empty to use the labelled mock extraction provider |
| `LLM_MODEL` | Optional. Model name for the real provider |
| `LLM_TIMEOUT_MS` | Optional. Request timeout for the real provider |

Set these in the Vercel project settings. Never commit values.

## Database

Migrations live in `prisma/migrations` and are applied with `npm run db:deploy`
(`prisma migrate deploy`). Run it against the hosted database before the first deploy and
after any new migration. The second migration installs triggers that make the three rate
tables append-only.

## Demo logins

Created by `npm run db:seed`. Fake addresses, demo passwords only. **Change or remove them on any real deployment.**

| Role | Email | Password |
|------|-------|----------|
| Estimator | `estimator@quotedesk.example` | `Estimator#2611` |
| Sales head | `saleshead@quotedesk.example` | `SalesHead#2611` |

Seeding is safe to repeat: existing users, rates, RFQs and past quotes are left alone, so a changed password is never overwritten.
Five wrong passwords for one email lock that email out for 15 minutes.
