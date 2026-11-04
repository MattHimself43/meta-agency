# Scalora / AgencyOS monorepo

| App | Path | What it is | Deploys to |
| --- | --- | --- | --- |
| Landing page | `apps/landing` | The public Scalora site — plain static HTML/CSS/JS, unchanged | Existing Vercel project (root directory `apps/landing`) |
| AgencyOS | `apps/dashboard` | Private dashboard that runs the agency (Next.js 15 + Supabase) | New Vercel project (root directory `apps/dashboard`), e.g. `app.<domain>` |

> **Before merging this branch:** the landing page moved from the repo root to `apps/landing`.
> In the existing Vercel project go to **Settings → Build and Deployment → Root Directory** and set it to `apps/landing`
> (Framework preset: *Other*, no build command, output directory `.`). Otherwise production will deploy an empty site.

Owner-facing guide: [`docs/OWNER_GUIDE.md`](docs/OWNER_GUIDE.md). Change history: [`CHANGELOG.md`](CHANGELOG.md).

---

## AgencyOS

**Rule behind every feature: the AI prepares, Matthias approves.** Nothing is sent, launched, re-budgeted or invoiced
without an owner click, except item types explicitly allowed to be auto-approved in Settings (only day-3 and day-7
follow-ups qualify, and the server enforces that list — see `lib/approvals/types.ts`).

### Stack

Next.js 15 (App Router, Server Actions) · Supabase (Postgres, Auth with TOTP 2FA, Storage, RLS) · Drizzle ORM + SQL
migrations · Tailwind + shadcn-style components · lucide-react · Zod · date-fns-tz · Anthropic SDK · Resend · Vitest · Playwright.

### Layout

```
apps/dashboard/
  app/
    (dashboard)/dashboard/   owner screens (Home, Approvals, Routines, Settings, Audit log) + actions.ts
    login/ mfa/              email+password, then TOTP enrol/verify
    api/cron/dispatch/       15-minute dispatcher (CRON_SECRET)
    api/export/[table]/      owner-only CSV export
  lib/
    db/schema.ts             full data model (every table in the spec)
    approvals/               approval types, risk, auto-approve gate, decide/edit + handlers
    routines/                definitions, AST scheduling, runner (retry once + alert), registry of handlers
    jobs.ts                  Postgres job queue for long work (SKIP LOCKED batches)
    auth.ts                  requireStaff / requireOwner (verified JWT + aal2 + profile role)
    audit.ts crypto.ts money.ts phone.ts time.ts rate-limit.ts flags.ts settings.ts email.ts
  drizzle/                   0000_init.sql (tables) · 0001_security.sql (RLS, triggers, append-only audit log)
  supabase/cron.sql          pg_cron + pg_net dispatcher for Vercel Hobby
  supabase/local-shim.sql    fake `auth` schema for plain local Postgres (tests only)
  scripts/                   migrate.ts · seed.ts · seed-data.ts
  tests/                     Vitest unit tests + DB acceptance test
  e2e/                       Playwright smoke tests
```

### Local setup

Requires Node 20+.

```bash
npm install                                  # from the repo root (npm workspaces)
cp apps/dashboard/.env.example apps/dashboard/.env.local   # fill in values
cd apps/dashboard
npm run db:migrate                           # applies drizzle/*.sql to DATABASE_URL
npm run seed                                 # niches, templates, packages, routines + demo data
npm run dev                                  # http://localhost:3000
```

Generate secrets with `openssl rand -base64 32` (`CRON_SECRET`, `TOKEN_ENCRYPTION_KEY`).

### Supabase setup

1. Create a Supabase project (region closest to T&T: `us-east-1`).
2. **Authentication → Sign In / Providers**: keep Email on, **turn "Allow new users to sign up" off**.
3. **Authentication → Multi-Factor**: make sure TOTP is enabled.
4. **Authentication → Users → Add user**: create Matthias's login (email + password, auto-confirm).
5. Copy URL, anon key, service role key and the **transaction pooler** connection string (port 6543) into `.env.local` / Vercel.
6. `npm run db:migrate`, then `npm run seed -- --owner matthias@example.com` to make that user the owner.
7. First sign-in: password → scan the QR code with an authenticator app → done. Every later sign-in asks for a code.

How access works:

- New auth users get a `profiles` row with role `none` (no access). Only `--owner` (or SQL below) grants access:
  `update profiles set role = 'owner' where email = 'matthias@example.com';`
- `/dashboard/**` requires a two-factor-verified session (JWT `aal = aal2`) — enforced in `middleware.ts`, again in
  `lib/auth.ts` for every page/action, and again in Postgres RLS (`is_staff()` checks `aal2`).
- RLS is on for every table. The `anon` role has no grants at all. Billing, settings and AI cost are owner-only;
  `integrations`, `jobs` and `rate_limits` are not reachable through the Supabase Data API at all.
- The Next.js server uses `DATABASE_URL` (bypasses RLS) and does its own role checks; RLS protects against anyone
  using the public anon key directly.
- `audit_log` is append-only: a trigger rejects UPDATE, DELETE and TRUNCATE.

Backups: Supabase takes daily backups on paid plans (Database → Backups; Pro keeps 7 days, enable PITR for more).
On the free plan, use **Settings → Export** in the dashboard (one CSV per table) or `pg_dump` on a schedule.

### Scheduling (cron)

All routine times are stored as cron expressions in **America/Port_of_Spain** (AST, UTC−4, no DST). One dispatcher
route, `/api/cron/dispatch`, runs every 15 minutes, works out what is due, claims each occurrence atomically (so
overlapping or repeated calls never double-run), runs it, retries once on failure, raises an alert if the retry fails,
then drains the job queue within the remaining time budget. Long work is split into per-item `jobs`.

Pick **one**:

- **Vercel Pro** — add to `apps/dashboard/vercel.json`:
  ```json
  "crons": [{ "path": "/api/cron/dispatch", "schedule": "*/15 * * * *" }]
  ```
  Vercel automatically sends `Authorization: Bearer $CRON_SECRET` when the `CRON_SECRET` env var is set.
  (Not committed by default because Hobby rejects deployments with sub-daily crons.)
- **Vercel Hobby** — run `apps/dashboard/supabase/cron.sql` in the Supabase SQL editor after filling in your URL and
  `CRON_SECRET`. It uses `pg_cron` + `pg_net`, with both values kept in Supabase Vault.

Test by hand: `curl -H "Authorization: Bearer $CRON_SECRET" https://app.<domain>/api/cron/dispatch`.
The **System test** routine (daily 12:00 AST) proves the schedule end to end: it drops a low-risk item in the
approval queue and a row in its run log. Turn it off in Routines once you're happy.

### Deploying the dashboard to Vercel

1. **Add New → Project →** import this repo. **Root Directory: `apps/dashboard`**. Framework: Next.js.
2. Add every variable from `.env.example` (Production + Preview). `APP_URL` = the final URL.
3. Deploy, then add the domain `app.<domain>` under Settings → Domains.
4. Set up the cron (above).
5. Use preview deployments for branches; only merge to the production branch when a phase is accepted.

### Feature flags

Settings → Feature flags (owner only). Everything works with every flag off.

| Flag | Off (default) | On | Needs |
| --- | --- | --- | --- |
| `meta_api` | Manual mode: Ads Manager checklists + CSV import | Build campaigns (always PAUSED), read insights | Meta developer app, business verification, `META_APP_ID/SECRET`, System User token (Phase 3) |
| `gmail` | Copy button + mailto link | Send approved emails, sync replies | `GOOGLE_CLIENT_ID/SECRET` (Phase 3) |
| `google_calendar` | Availability from Settings | Busy times + today's calls from Calendar | same Google app (Phase 3) |
| `higgsfield` | "Generate externally and upload" | Generate image/video variants | `HIGGSFIELD_API_KEY` (Phase 3) |
| `wipay` | Bank transfer details + Mark paid | WiPay hosted payment links + callback | Registered business, `WIPAY_*` (Phase 3) |
| `team_seats` | Owner only | Invite account managers | v2 |

### Seed data

`npm run seed` adds the 2 niches, 3 packages, 7 message templates, default 0/3/7-day sequences, all routines, and demo
data (10 leads, 2 clients, 14 days of performance, 2 approvals). Every demo row has `is_demo = true` and the business
names are fictional. `npm run seed:wipe` deletes only demo rows. `npm run seed -- --no-demo` skips demo data. The seed
is idempotent and never overwrites a routine schedule you changed.

### Tests

```bash
npm test                                     # unit tests (no DB needed; DB test is skipped)
TEST_DATABASE_URL=postgres://… npm test      # + Phase 0 acceptance test against a migrated, seeded DB
BASE_URL=http://localhost:3000 npm run test:e2e   # Playwright smoke tests against a running app
```

For a throwaway local Postgres (no Supabase): create a database, run `psql -f supabase/local-shim.sql`, then
`npm run db:migrate && npm run seed`. Never run the shim against Supabase.

### Making schema changes

Edit `lib/db/schema.ts`, run `npm run db:generate -- --name what_changed`, review the SQL in `drizzle/`, then
`npm run db:migrate`. New tables automatically get RLS only if you add policies — follow `0001_security.sql`.
