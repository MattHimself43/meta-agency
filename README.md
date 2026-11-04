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

### AI (Claude)

All AI calls go through `lib/ai/client.ts` → `runPrompt(prompt, input, purpose)`:

- Prompts live in `lib/ai/prompts/*.v1.ts`, each with a Zod output schema. Change a prompt → bump its version.
- `AI_MODEL_FAST` (default `claude-sonnet-5-5`) writes messages and does research; `AI_MODEL_DEEP` (default
  `claude-opus-5-5`) writes audits, call briefs and proposals.
- Structured outputs (`output_config.format`) guarantee the shape; lead research, ad checks, audits and call briefs use
  Anthropic's server-side web search (capped per prompt).
- **Refusal fallback is on**: requests use the `server-side-fallback-2026-07-01` beta with `fallbacks: "default"`, so a
  request a model declines is retried on a suitable model in the same call. Remove those two fields in
  `lib/ai/client.ts` to turn it off.
- Every call writes an `ai_usage` row (prompt version, model, input snapshot, output, tokens, estimated cost).
- Without `ANTHROPIC_API_KEY` the app still works: template drafts, document skeletons, research disabled.

### Public routes

| Route | What | Protection |
| --- | --- | --- |
| `/book` | 20-minute call booking | rate limit (5/hour/IP), honeypot, slot re-validated server-side, unique slot index |
| `/share/audit/<token>`, `/share/proposal/<token>` (+ `/pdf`) | approved documents | 32-byte token stored hashed, rate limit (60/10 min/IP), only `approved` docs |
| `/api/cron/dispatch` | scheduler | `CRON_SECRET` |
| `/pay/<token>` | invoice pay page (WiPay on) | 32-byte token stored hashed, rate limit; only lets someone pay that invoice |
| `/api/payments/wipay/response` | WiPay redirect after checkout | response hash re-computed server-side from the stored total; rate limit |
| `/portal/<token>` | client onboarding portal | 32-byte token stored hashed, rate limit, files scoped to that client |
| `/share/report/<token>` (+ `/pdf`) | approved weekly reports | same as other share links |

Wire the landing page's "Book a call" buttons to `https://app.<domain>/book` when you're ready (not changed yet — say the word).

### File storage (Phase 2)

Portal uploads, signatures and signed PDFs go through `lib/storage.ts`:

- **With `SUPABASE_SERVICE_ROLE_KEY`** (recommended): create a **private** bucket named `agencyos` in Supabase →
  Storage (or set `STORAGE_BUCKET`). Browsers upload straight to Storage with signed URLs (app limit 200 MB per file; the Supabase free plan caps files at 50 MB).
- **Without it**: files up to 4 MB are stored in the `stored_files` table. Fine for testing; add the key before
  clients upload videos.

`AGENCY_META_BUSINESS_ID` (optional) is shown to clients in the Meta-access step so they know which business to add as
a partner.

### Integrations (Phase 3)

All of these are optional and switched on per flag. Tokens are stored encrypted with `TOKEN_ENCRYPTION_KEY`
(32 bytes, base64 or hex — `openssl rand -base64 32`), so set that first.

**Meta Marketing API** (`meta_api`)
1. Create a Meta developer app (Business type) and add the Marketing API product. Business verification is needed
   for full access to client ad accounts.
2. Business Settings → Users → **System users** → add an admin system user, assign it the agency's ad accounts /
   Pages (clients' accounts are shared to the agency through partner access), then **Generate token** with
   `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`,
   `leads_retrieval`.
3. Paste the token on **Integrations → Meta** (Test shows the system user). Optional: set `META_APP_SECRET` so every
   call carries `appsecret_proof`. `META_API_VERSION` overrides the version (default `v26.0`).
4. Turn on the flag. Per client: **Clients → Overview → Check access via Meta API**, then approve a plan and press
   **Build in Meta (PAUSED)**. Lead-form plans need the instant form ID pasted on the plan.
5. Manual check on a test ad account before using it for real: build a plan, confirm in Ads Manager that the
   campaign, ad set and ad are all **Off**, then press Launch and confirm they switch on.

How the "never ACTIVE" rule is enforced: `lib/meta/guard.ts` scans every write for ACTIVE (any status field, any
depth, inside JSON) and refuses it unless it carries a one-time grant from `issueLaunchGrant`, which needs an owner
Actor and is only called from `launchPlan`. Creates without a status are forced to PAUSED.

**Google** (`gmail`, `google_calendar`)
1. Google Cloud console → new project → enable **Gmail API** and **Google Calendar API**.
2. OAuth consent screen (External; add yourself as a test user while unverified) with scopes `gmail.send`,
   `gmail.readonly`, `calendar.readonly`, `calendar.events`.
3. Credentials → OAuth client ID (Web). Authorised redirect URI: `https://<APP_URL>/api/integrations/google/callback`.
4. Set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, redeploy, then **Integrations → Connect Google**.

**Higgsfield** (`higgsfield`) — create a key at console.higgsfield.ai and set `HIGGSFIELD_API_KEY=KEY_ID:KEY_SECRET`
(or paste it on Integrations). Video variants use `higgsfield-ai/dop/standard` unless you set another model path;
image variants need an image-edit model path from the console. Extra model parameters (JSON) are sent as-is — check
the model's page for its input schema.

**WiPay** (`wipay`) — Payments API v1, docs.wipayfinancial.com.
- Sandbox (default): no keys needed; uses WiPay's public test account (1234567890 / API key 123) on
  `ttsb.wipayfinancial.com`. Test cards: docs.wipayfinancial.com/payments-api/testing (e.g. Visa 4000000000002719).
- Live: `WIPAY_ENVIRONMENT=live`, `WIPAY_ACCOUNT_NUMBER`, `WIPAY_API_KEY` (WiPay → Developer → Payment API; register
  your `APP_URL` as the website there).
- Response URL (shown on Integrations): `https://<APP_URL>/api/payments/wipay/response`.
- **Manual sandbox check** on the deployed app: turn the flag on, approve an invoice, press **Mark sent**, open its
  pay link, **Pay by card**, use a test card, and confirm you land on "Payment received" and the invoice shows
  *Paid by wipay*.
- `WIPAY_BASE_URL`, `META_GRAPH_URL`, `HIGGSFIELD_BASE_URL` and the `GOOGLE_*_URL` variables exist only so tests
  can point at local stand-ins. Never set them in production.

### Feature flags

Settings → Feature flags (owner only). Everything works with every flag off.

| Flag | Off (default) | On | Needs |
| --- | --- | --- | --- |
| `meta_api` | Manual mode: Ads Manager checklists + CSV import | Build plans PAUSED, owner Launch, insights, access check, lead inbox | System User token (Integrations), optional `META_APP_SECRET` |
| `gmail` | Copy button + mailto link | Send approved emails, sync replies | `GOOGLE_CLIENT_ID/SECRET` + Connect Google |
| `google_calendar` | Availability from Settings | Busy times hide /book slots; booked calls added to Calendar | same Google connection |
| `higgsfield` | "Generate externally and upload" | Image/video variants from client photos | `HIGGSFIELD_API_KEY` (or Integrations) |
| `wipay` | Bank transfer details + Mark paid | /pay link → WiPay hosted checkout → verified response marks paid | `WIPAY_*` (sandbox works with no keys) |
| `team_seats` | Owner only | Invite account managers (Settings → Team seats) | Create their Supabase login |

### Seed data

`npm run seed` adds the 2 niches, 3 packages, 7 message templates, default 0/3/7-day sequences, all routines, and demo
data (10 leads, 2 clients, 14 days of performance, 2 approvals). Every demo row has `is_demo = true` and the business
names are fictional. `npm run seed:wipe` deletes only demo rows. `npm run seed -- --no-demo` skips demo data. The seed
is idempotent and never overwrites a routine schedule you changed.

### Tests

```bash
npm test                                     # unit tests (no DB needed; DB test is skipped)
TEST_DATABASE_URL=postgres://… npm test      # + Phase 0/1 acceptance tests against a migrated, seeded DB
                                             #   (use a throwaway DB: the tests create and delete rows)
BASE_URL=http://localhost:3000 npm run test:e2e   # Playwright smoke tests against a running app
```

For a throwaway local Postgres (no Supabase): create a database, run `psql -f supabase/local-shim.sql`, then
`npm run db:migrate && npm run seed`. Never run the shim against Supabase.

### Making schema changes

Edit `lib/db/schema.ts`, run `npm run db:generate -- --name what_changed`, review the SQL in `drizzle/`, then
`npm run db:migrate`. New tables automatically get RLS only if you add policies — follow `0001_security.sql`.
