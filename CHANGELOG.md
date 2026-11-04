# Changelog

## Phase 2 — Deliver (2026-11-04)

**Client portal** (`/portal/<token>`, phone-first, no login)
- Private link per client (32-byte token, stored hashed, rate-limited; rotate it from the client page — the old link
  stops working at once).
- Four steps with a progress bar: **agreement** (agreement text from Settings + package, typed name + finger-drawn
  signature, time and IP stored, signed PDF saved, setup-fee invoice drafted), **intake** (questions come from the
  client's niche), **uploads** (photos, video, logo, brand colours; direct-to-storage, thumbnails), **Meta access**
  (screen-by-screen partner-access walkthrough, ad account ID check, "card added" confirmation).
- Client can approve or ask for changes on creatives sent for review, and read approved reports.
- When the client's four steps and the owner's two checks (access verified, spending limit set) are done, the client
  goes **active** and an AI kickoff plan lands in the approval queue (once).

**Creative studio**
- Ad copy drafted from intake answers (AI or template), editable; every save re-runs the **honesty check**: prices,
  deposits, percentages and "in stock" claims must appear in the client's intake answers. Failing copy can't go to the
  client or live without an owner override (logged with a reason).
- Statuses draft → internal review → client review → approved → live → retired; fatigue flags (frequency over 3, or CTR
  30% under its first week).

**Campaigns (manual mode)**
- Plan editor: niche templates, audiences, T&T locations, placements, budget, ads from the studio.
- Special ad categories (housing, credit) detected and **enforced** (age 18–65+, all genders, radius ≥ 15 miles) with
  an owner confirmation before approval.
- Numbered **Ads Manager checklist** generated from the plan, printable, always ending with the campaign switched OFF.
- Draft → approved (owner) → built (paused, IDs pasted) → live (owner, only after the spending-limit step) → paused.
- Budget guardrails: raises over 20% in 7 days or above the owner limit go to the approval queue.

**Performance, reports, billing**
- Ads Manager CSV import (header aliases, any date format Meta exports), upserted per ad per day.
- **Morning account check** (daily 06:30): flags vs target cost per result, fatigue, recommendations (pause ad, shift
  budget, new creative, raise/lower budget) queued as approvals; Home shows the **morning brief**.
- **Weekly reports** (Mondays): numbers + AI or template narrative, branded PDF, approve → share link for the client.
- **Billing**: 1st-of-month run drafts one invoice per active client (idempotent — reruns never duplicate), sequential
  numbers on approval, PDF, bank-transfer instructions, mark sent/paid, overdue chaser at 3/10/21 days (WhatsApp text
  prepared, never sent). Revenue, MRR and margin on Analytics. WiPay stays behind its flag (Phase 3).
- New routines: morning check, weekly reports, month-end close, onboarding chaser, invoice chaser, creative refresh,
  weekly review.

**Storage**
- Supabase Storage (private bucket `agencyos`, signed uploads up to 200 MB; the Supabase free plan caps files at 50 MB) when `SUPABASE_SERVICE_ROLE_KEY` is set;
  otherwise files up to 4 MB are kept in the database so everything still works.

**Migration** `0003_phase2_deliver.sql` — intake/brand fields on clients, launch fields on plans, invoice reminders,
`budget_changes`, `stored_files`; RLS on both new tables.

**Tests** — 88 (24 new unit tests + 7 database acceptance tests: portal steps → active + kickoff, plan → checklist,
CSV → morning brief + report PDF, monthly run with no duplicates on rerun). Portal walked end to end on an emulated
iPhone 13 with touch signature.

## Phase 1 — Sell (2026-11-04)

**AI layer** (`lib/ai/`)
- One runner for every Claude call: Zod-validated structured outputs, server-side web search (with `pause_turn`
  handling), server-side refusal fallback, and an `ai_usage` row per call (prompt key + version, model, input snapshot,
  tokens, estimated cost — shown in Settings → AI cost).
- Versioned prompts with output schemas: outreach message, reply handler, lead research, ad check, audit, call brief,
  proposal. Shared voice (Trinidadian English, TT$/US$) and honesty rules: never invent facts; missing facts are listed.
- Everything works without an API key: messages are drafted from niche templates filled only with known facts,
  documents start as skeletons, and research/ad checks are disabled with a clear message.

**Leads & CRM**
- Leads table with filters (niche, stage, area, score, runs ads, search), sorting, saved views, bulk actions
  (draft first message, move stage, do not contact), add lead, CSV export.
- CSV import with in-browser column mapping and preview; duplicates (same phone or Facebook page) skipped.
- AI lead research (on demand and weekly routine) with source URLs for every fact; Meta ad activity check; fit score
  1–10 from the niche's rules with reasons, owner override kept across rescoring.
- Pipeline board: drag and drop on desktop, stage menu on phones; every move logged; Lost asks for a reason; Won creates
  the client, portal token (shown once), six onboarding steps and the setup-fee invoice draft (founding-client offer
  respected). Invoices get their sequential number only when approved.
- Lead profile: timeline, messages in progress with send buttons, documents, quick actions, details and score override.
- Ads audit, call brief and proposal: generated, editable, branded PDF, and (audit/proposal) approve → private share
  link (token shown once, stored hashed, rate-limited public page). Proposal prices always come from the package table.

**Outreach**
- Sequences: day 0 opener → day 3 follow-up → day 7 last nudge → Nurture. Mark sent schedules the next step; the outreach
  batch writes it on the day it's due. A reply, booked call, Won, Lost or do-not-contact stops the sequence.
- Daily outreach batch (Mon–Fri 08:00 AST): top-scored uncontacted leads + due follow-ups, one job per lead, capped by
  the daily WhatsApp limit (reruns on the same day add nothing).
- Today's sends (Home + Outreach): Open in WhatsApp (wa.me, text pre-filled — never sent automatically), email via
  mailto, DM via copy + open page; Mark sent enforces daily limits and do-not-contact.
- Reply handling: paste a reply → classified (interested / question / not now / no / stop) → response draft for approval;
  "stop" sets do-not-contact.
- Template library with reply rate per template; sequences view; do-not-contact list.
- Approval queue shows both message variants ("Use this") and missing facts.

**Booking**
- Public `/book` page: 20-minute slots from Settings availability in AST, 2 h notice, honeypot + rate limit. A booking
  links or creates the lead, moves it to Call booked and queues the call brief. Home shows today's calls with briefs.

**Tests**: 57 Vitest tests (13 new unit tests + 6 database acceptance tests for Phase 1) and 13 Playwright smoke tests.

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
