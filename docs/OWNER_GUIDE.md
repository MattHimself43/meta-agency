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
3. **Today's WhatsApp sends** (5 min). Tap **Open in WhatsApp** — the message opens on your phone, ready.
   Press send yourself, then tap **Mark sent**. AgencyOS never sends WhatsApp for you; that protects your number.
   Marking sent schedules the next message (day 3, then day 7). Daily limits (10 WhatsApp by default) stop you
   over-sending.
4. **Replies** (as they come). Open the lead (or Outreach → Replies), paste what they said, press **Log reply**.
   The follow-ups stop, the reply is labelled (interested, question, not now, no, stop) and a response waits in your
   queue. "Stop" puts them on the do-not-contact list for good.

## Finding and working leads

- **Leads**: every prospect with a fit score out of 10 (tap a lead to see why). Filter by niche, area, stage or
  score and save the filter as a view. Add leads by hand, **Import CSV**, or **Research new leads** (needs the AI key).
- Every weekday at 8:00 the **outreach batch** picks your 10 best uncontacted leads and drafts two versions of a first
  message for each. Pick a version with **Use this**, edit if needed, approve.
- **Pipeline**: drag leads between stages (on your phone use the menu on each card). Moving to **Won** creates the client
  and their setup invoice draft and shows the client portal link once — copy it.
- Before a call: open the lead → **Write call brief** (one page: their stock, ads, competitors, objections, package to
  suggest). Calls booked through your booking page get a brief automatically.
- After a call: **Write a proposal** — paste your notes, check it, then **Approve & create share link** and send the
  link on WhatsApp. Prices always come from your packages. **Generate audit** works the same way for a free ads audit.
- Your booking link is `app.yourdomain.com/book` — put it in your WhatsApp replies and on the website.

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

## Onboarding a client

1. Move the lead to **Won** on the Pipeline. AgencyOS creates the client, a private portal link, the onboarding
   checklist and the setup-fee invoice draft.
2. Send the client their portal link (WhatsApp). On their phone they: sign the agreement, fill the intake form,
   upload photos/logo, and follow the screen-by-screen steps to give you **partner access** in Meta Business Manager
   and add **their own card** to their ad account. The client always owns their Page and ad account and pays Meta
   directly — you only invoice your fee.
3. Tick **Agency access verified** and **Spending limit set in Meta** yourself. No campaign can launch until the
   spending-limit step is ticked.
4. When every step is done, the first-month plan lands in your approval queue.
5. Lost the link or sent it to the wrong person? Client page → **Rotate portal link**. The old link dies at once.

## Ads, campaigns and the weekly rhythm (manual mode)

1. **Creative studio** → *Draft copy* for a client. Edit freely. A red **unverified claim** means a price, deposit or
   "in stock" line isn't in the client's intake answers — fix the copy or the intake, or override with a reason.
   Send good copy to **client review**; the client approves it in their portal.
2. **Campaigns** → *New plan*. Pick a template, audience, areas, budget and ads. If it's housing or credit, AgencyOS
   applies Meta's restricted targeting and asks you to confirm. Approve the plan.
3. Open the **Ads Manager checklist** (print it if you like) and build it step by step in Ads Manager. It ends with the
   campaign **switched OFF**. Paste the IDs and press **Mark built**.
4. Press **Launch** when you're ready (needs the client's spending limit ticked), then switch it on in Ads Manager.
5. Each morning (or whenever), export the last 7 days from Ads Manager as CSV (*Reports → Export → CSV*, breakdown by
   day, level: ad) and import it on the client's **Performance** tab. The 06:30 morning check turns it into the
   **morning brief** on Home and recommendations in your queue.
6. Mondays: weekly reports are drafted for each active client. Read, approve, then **Share** — copy the link into
   WhatsApp for the client.
7. Budget changes over 20% in a week, or above your limit, go to the approval queue before they count.

## Getting paid

- On the 1st, the month-end close drafts one invoice per active client (running it again never makes duplicates).
  Approve to give it its number, download the PDF, send it with the bank details, press **Mark sent**.
- When money lands, **Mark paid**. Overdue invoices get a polite reminder drafted at 3, 10 and 21 days — you send it.
- **Analytics** shows revenue, MRR, ad spend under management and margin.

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
