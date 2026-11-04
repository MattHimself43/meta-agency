# AgencyOS — owner guide

For Matthias. No technical knowledge needed. AgencyOS prepares the work; **nothing goes to a prospect or client, goes
live in Meta, changes a budget or becomes an invoice until you press Approve.**

## Signing in

1. Go to your AgencyOS address (e.g. `app.yourdomain.com`) and enter your email and password.
2. The first time, scan the QR code with an authenticator app (Google Authenticator, Authy or 1Password) and type the
   6-digit code. After that, every sign-in asks for a fresh code from the app.
3. Keep your phone safe — the code is what protects client ad accounts. If you change phones, ask your developer to
   reset two-factor in Supabase before you wipe the old one.

## Your 15 minutes a day

Best done after the 07:15 digest email lands.

1. **Home → Alerts** (2 min). Anything red first: a failed routine, a disconnected integration, an overdue invoice.
   Dismiss alerts you've dealt with.
2. **Approval queue** (8 min). Highest risk is at the top. For each item:
   - read the preview,
   - **Edit** if a word is off (your edit is saved and logged),
   - **Approve** or **Reject**.
   Low-risk items (like day-3 follow-ups) can go together with **Approve all low risk**.
3. **Today's WhatsApp sends** (5 min, from Phase 1). Tap **Open in WhatsApp** — the message opens on your phone, ready.
   Press send yourself, then tap **Mark sent**. AgencyOS never sends WhatsApp for you; that protects your number.

Everything works on your phone. The bottom bar has Home, Approve, Routines and Settings.

## How approving works

- Every item shows a risk level: **low**, **medium** or **high**.
- First messages, campaign launches, budget increases and invoices **always** need you. They can't be set to
  auto-approve, even by mistake.
- Only day-3 and day-7 follow-ups *can* be auto-approved — and only if you switch that on in
  **Settings → Operations → Auto-approve**. They're off to start with.
- Every decision (who, what, when) is kept in **Audit log**, and that log can't be edited or deleted.

## Routines (the scheduled work)

**Routines** shows everything AgencyOS does on its own, in Trinidad time:

| Routine | When |
| --- | --- |
| Morning account check | Daily 7:00 am |
| Daily digest email | Daily 7:15 am |
| Outreach batch | Mon–Fri 8:00 am |
| Lead refresh | Mondays 6:00 am |
| Weekly reports | Mondays 9:00 am |
| Creative refresh | Every 2nd Wednesday 9:00 am |
| Month-end close | 1st of the month 8:00 am |
| Onboarding chaser | Daily 10:00 am |
| Overdue invoice chaser | Daily 11:00 am |
| Weekly agency review | Fridays 4:00 pm |
| System test | Daily 12:00 noon (proves the schedule works — switch it off once you trust it) |

Use the switch to turn one on or off, **Run now** to run it straight away, and open a routine to see its run log or
change its time. Routines marked "Phase 1" or "Phase 2" are placeholders until that part is built.

## Onboarding a client (from Phase 2)

1. Move the lead to **Won** on the Pipeline. AgencyOS creates the client, a private portal link, the onboarding
   checklist and the setup-fee invoice draft.
2. Send the client their portal link (WhatsApp). On their phone they: sign the agreement, fill the intake form,
   upload photos/logo, and follow the screen-by-screen steps to give you **partner access** in Meta Business Manager
   and add **their own card** to their ad account. The client always owns their Page and ad account and pays Meta
   directly — you only invoice your fee.
3. Tick **Agency access verified** and **Spending limit set in Meta** yourself. No campaign can launch until the
   spending-limit step is ticked.
4. When every step is done, the first-month plan lands in your approval queue.

## Settings to fill in once the business is registered

**Settings → Agency profile**: business name, address, registration number, bank details, invoice prefix, and VAT
(off by default; 12.5% when switched on). Placeholders like `[Bank]` show until you replace them.

**Settings → Operations**: the TT$ per US$ exchange rate (default 6.80) used for ad-spend estimates, and daily send
limits (10 WhatsApp, 20 email by default).

## Turning on WiPay (after registration)

1. Open a WiPay merchant account for the registered business.
2. Give your developer the WiPay account number and API key; they add them to the hosting settings and test in
   sandbox first.
3. Then **Settings → Feature flags → WiPay payments** on. Invoices get a "Pay online" link and are marked paid
   automatically. Until then, invoices show your bank details and you press **Mark paid** when money arrives.

## Turning on the Meta API (after registration)

1. Your developer creates a Meta developer app and you complete **Meta business verification** with the registration
   documents.
2. In your agency's Business Manager, create a **System User** and give it access to each client's ad account (you
   already have partner access from onboarding). Your developer stores its token in **Integrations**.
3. Then **Settings → Feature flags → Meta Marketing API** on. Campaigns are then built straight in Ads Manager —
   **always paused**. Going live is a separate **Launch** button that only you can press.
4. Until then (Manual mode) AgencyOS gives you a numbered Ads Manager checklist, and you upload the Ads Manager CSV
   export so reports and the morning brief still work.

## Backups and exports

**Settings → Export** downloads any table as a spreadsheet (CSV). Supabase also keeps daily backups on paid plans.
