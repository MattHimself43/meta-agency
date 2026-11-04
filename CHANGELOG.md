# Changelog

## Phase 0 — Foundations (2026-11-04)

**Repo**
- Turned the repo into an npm-workspaces monorepo. The Scalora landing page moved, byte-for-byte unchanged, to
  `apps/landing`. **Action needed before merge:** set the existing Vercel project's Root Directory to `apps/landing`.
- New Next.js 15 app `apps/dashboard` (AgencyOS), styled to match the landing page: same navy, blue→cyan gradient,
  glass surfaces, grid/orb background, Space Grotesk + Inter.

**Data**
- Full data model from the spec in `lib/db/schema.ts` (37 tables); SQL migrations in `apps/dashboard/drizzle/`.
- Row Level Security on every table; staff access needs a 2FA-verified session (`aal2`) at the database level too.
  Billing/settings/AI cost owner-only; `anon` has no access. Append-only `audit_log` (trigger blocks UPDATE/DELETE).
- Idempotent seed: 2 niches (scoring rules, KPI targets, intake schemas, campaign templates), 3 packages, 7 message
  templates, 0/3/7-day sequences, all 11 routines, plus clearly-fictional demo data (`is_demo`) and `seed:wipe`.

**Features**
- Supabase Auth sign-in with TOTP two-factor (enrol by QR code on first sign-in; required for every session).
- Roles: owner, account manager (built, invite UI hidden behind `team_seats`), none.
- Approvals framework: typed item registry with risk levels, server-enforced auto-approve allowlist (only day-3/day-7
  follow-ups), Approve / Reject / Edit / Approve-all-low-risk, every decision in the audit log.
- Routines: AST cron schedules (incl. every-2nd-Wednesday), 15-minute dispatcher with atomic claiming, retry-once +
  urgent alert, run log, toggle / edit schedule / Run now. System test and Daily digest routines are live; the rest are
  placeholders until their phase.
- Postgres job queue for long work; rate limiter for public routes; AES-256-GCM token encryption helpers.
- Screens: Home (KPI strip, approval queue, alerts, placeholders for later widgets), Approvals, Routines, Settings
  (agency profile with placeholders, operations, auto-approve, feature flags, packages, AI cost, CSV export), Audit log.
  Phone layout with bottom tabs.

**Tests**
- 38 Vitest tests (scheduling in AST, approval policy, wa.me encoding, money, crypto, CSV) including a database
  acceptance test: dispatcher runs the System test at 12:00 AST, logs it, doesn't double-run, approval is logged.
- 10 Playwright smoke tests (desktop + phone).

**Not deployed yet:** a Vercel preview needs the Supabase project and env vars (see README → Deploying).
