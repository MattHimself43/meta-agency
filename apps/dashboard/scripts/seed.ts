/**
 * npm run seed                      — reference data (niches, templates, sequences, packages, routines) + demo data
 * npm run seed -- --no-demo         — reference data only
 * npm run seed -- --owner a@b.com   — also promote that Supabase user to owner
 * npm run seed:wipe                 — delete every demo row (is_demo = true); reference data is kept
 *
 * Idempotent: running it twice changes nothing the second time.
 */
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, sql } from "drizzle-orm";
import * as schema from "../lib/db/schema";
import { ROUTINE_DEFINITIONS } from "../lib/routines/definitions";
import { DEMO_CLIENTS, DEMO_LEADS, NICHES, ONBOARDING_STEPS, PACKAGES, PACKAGE_TERMS, TEMPLATES } from "./seed-data";
import { createHash, randomBytes } from "node:crypto";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const db = drizzle(client, { schema });

// Tables with is_demo, in delete order (children first).
const DEMO_TABLES = [
  "approvals", "payments", "invoice_lines", "invoices", "expenses", "reports", "recommendations", "performance_daily", "budget_changes",
  "creatives", "campaign_plans", "assets", "agreements", "onboarding_steps", "messages", "audits", "call_briefs",
  "proposals", "bookings", "activities", "clients", "leads",
];

async function wipe() {
  for (const t of DEMO_TABLES) {
    const res = await db.execute(sql.raw(`DELETE FROM public."${t}" WHERE is_demo = true`));
    const n = (res as unknown as { count?: number }).count ?? 0;
    if (n) console.log(`  wiped ${n} demo row(s) from ${t}`);
  }
  await db.insert(schema.auditLog).values({ actorType: "system", actorId: "seed", action: "seed.wiped_demo" });
}

async function reference() {
  await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing();

  const nicheIds: Record<string, string> = {};
  for (const n of NICHES) {
    const [row] = await db
      .insert(schema.niches)
      .values({ slug: n.slug, name: n.name, scoringRules: n.scoringRules, kpiTargets: n.kpiTargets, intakeSchema: n.intakeSchema, campaignTemplates: n.campaignTemplates })
      .onConflictDoNothing({ target: schema.niches.slug })
      .returning({ id: schema.niches.id });
    nicheIds[n.slug] = row?.id ?? (await db.select({ id: schema.niches.id }).from(schema.niches).where(eq(schema.niches.slug, n.slug)))[0]!.id;
  }

  const templateIds: Record<string, string> = {};
  for (const t of TEMPLATES) {
    const existing = await db.select({ id: schema.messageTemplates.id }).from(schema.messageTemplates).where(eq(schema.messageTemplates.key, t.key));
    if (existing[0]) {
      templateIds[t.key] = existing[0].id;
      continue;
    }
    const [row] = await db
      .insert(schema.messageTemplates)
      .values({ nicheId: nicheIds[t.niche], key: t.key, name: t.name, channel: t.channel, purpose: t.purpose, body: t.body })
      .returning({ id: schema.messageTemplates.id });
    templateIds[t.key] = row!.id;
  }

  // Default sequence per niche: day 0 opener, day 3 follow-up, day 7 last nudge (then Nurture).
  for (const n of NICHES) {
    const name = `Default — ${n.name}`;
    const existing = await db.select({ id: schema.sequences.id }).from(schema.sequences).where(eq(schema.sequences.name, name));
    if (existing[0]) continue;
    const [seq] = await db.insert(schema.sequences).values({ nicheId: nicheIds[n.slug], name }).returning({ id: schema.sequences.id });
    const prefix = n.slug === "car_dealers" ? "dealer" : "re";
    const opener = n.slug === "car_dealers" ? "dealer_opener_specific" : "re_opener_listing";
    await db.insert(schema.sequenceSteps).values([
      { sequenceId: seq!.id, stepOrder: 1, dayOffset: 0, channel: "whatsapp", purpose: "outreach_opener", templateId: templateIds[opener] },
      { sequenceId: seq!.id, stepOrder: 2, dayOffset: 3, channel: "whatsapp", purpose: "followup_day3", templateId: templateIds[`${prefix}_followup_day3`] },
      { sequenceId: seq!.id, stepOrder: 3, dayOffset: 7, channel: "whatsapp", purpose: "followup_day7", templateId: templateIds[`${prefix}_followup_day7`] },
    ]);
  }

  for (const p of PACKAGES) {
    await db.insert(schema.packages).values({ ...p, currency: "TTD", terms: PACKAGE_TERMS }).onConflictDoNothing({ target: schema.packages.slug });
  }

  // Routines: insert new ones; never overwrite a schedule or toggle the owner has changed.
  for (const r of ROUTINE_DEFINITIONS) {
    await db
      .insert(schema.routines)
      .values({
        key: r.key,
        name: r.name,
        description: r.description,
        cron: r.cron,
        everyNWeeks: r.everyNWeeks ?? 1,
        anchorDate: r.anchorDate ?? null,
        enabled: r.enabledByDefault,
        // Start from "now" so a fresh install doesn't immediately fire today's earlier slots.
        lastScheduledFor: new Date(),
      })
      .onConflictDoUpdate({ target: schema.routines.key, set: { name: r.name, description: r.description } });
  }

  return nicheIds;
}

async function demo(nicheIds: Record<string, string>) {
  const daysAgo = (n: number) => new Date(Date.now() - n * 86400_000);

  for (const l of DEMO_LEADS) {
    await db
      .insert(schema.leads)
      .values({
        id: l.id,
        businessName: l.businessName,
        nicheId: nicheIds[l.niche],
        area: l.area,
        contactName: l.contactName,
        phone: l.phone,
        phoneNormalized: l.phone,
        whatsapp: l.phone,
        facebookUrl: l.facebookUrl,
        instagramUrl: l.instagramUrl,
        website: l.website,
        source: l.source,
        runsMetaAds: l.runsMetaAds,
        adCount: l.adCount,
        adNotes: l.adNotes,
        fitScore: l.fitScore,
        scoreReasons: l.scoreReasons,
        stage: l.stage,
        estimatedValueCents: l.estimatedValueCents,
        lostReason: l.stage === "lost" ? "Happy with organic posts for now" : null,
        isDemo: true,
      })
      .onConflictDoNothing();
  }

  // A little activity history so KPIs and timelines aren't empty.
  const [{ n: actCount }] = (await db.execute(sql`SELECT count(*)::int AS n FROM activities WHERE is_demo`)) as unknown as [{ n: number }];
  if (!actCount) {
    const contacted = DEMO_LEADS.filter((l) => ["contacted", "replied", "call_booked", "proposal_sent", "lost", "nurture"].includes(l.stage));
    await db.insert(schema.activities).values([
      ...contacted.map((l, i) => ({ leadId: l.id, type: "message_sent" as const, channel: "whatsapp" as const, body: "Opener sent (demo)", occurredAt: daysAgo(i % 3), isDemo: true })),
      ...contacted
        .filter((l) => ["replied", "call_booked", "proposal_sent"].includes(l.stage))
        .map((l) => ({ leadId: l.id, type: "reply" as const, channel: "whatsapp" as const, body: "Sure, send it through (demo)", occurredAt: daysAgo(0), isDemo: true })),
    ]);
  }

  const pkgs = await db.select().from(schema.packages);
  for (const c of DEMO_CLIENTS) {
    await db
      .insert(schema.clients)
      .values({
        id: c.id,
        nicheId: nicheIds[c.niche],
        name: c.name,
        contactName: c.contactName,
        whatsapp: c.whatsapp,
        packageId: pkgs.find((p) => p.slug === c.packageSlug)?.id,
        status: c.status,
        startDate: c.startDate,
        contractEnd: c.contractEnd,
        adAccountId: c.adAccountId,
        monthlyBudgetUsdCents: c.monthlyBudgetUsdCents,
        healthScore: c.healthScore,
        portalTokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        lastContactAt: daysAgo(1),
        isDemo: true,
      })
      .onConflictDoNothing();

    for (const [i, s] of ONBOARDING_STEPS.entries()) {
      const done = c.status === "active" || (c.status === "onboarding" && i === 0);
      await db
        .insert(schema.onboardingSteps)
        .values({ clientId: c.id, ...s, sortOrder: i, status: done ? "done" : "pending", completedAt: done ? daysAgo(5) : null, isDemo: true })
        .onConflictDoNothing();
    }
  }

  // 14 days of fake performance for the active client.
  const active = DEMO_CLIENTS[0]!;
  for (let d = 1; d <= 14; d++) {
    const date = new Date(Date.now() - d * 86400_000).toISOString().slice(0, 10);
    const spend = 2200 + ((d * 337) % 900);
    const chats = 4 + (d % 5);
    await db
      .insert(schema.performanceDaily)
      .values({
        clientId: active.id,
        campaignName: "Demo — Click-to-WhatsApp",
        adSetName: "Trinidad 25-55",
        adName: d % 2 ? "Demo — $20k down Tiida" : "Demo — Weekend stock reel",
        date,
        spendUsdCents: spend,
        impressions: 9000 + d * 150,
        reach: 6000 + d * 90,
        frequency: (1.4 + d * 0.05).toFixed(3),
        clicks: 120 + d * 3,
        ctr: (1.3 + (d % 4) * 0.1).toFixed(4),
        whatsappConversations: chats,
        costPerResultUsdCents: Math.round(spend / chats),
        source: "manual",
        isDemo: true,
      })
      .onConflictDoNothing();
  }

  // Phase 2 demo: the active client has intake answers, a live campaign plan and creatives.
  const intake = {
    stock_list: "https://example.com/demo-stock (fictional)",
    price_range: "TT$85,000 – TT$190,000",
    financing_partners: "Demo Credit Union — 7.5% over 72 months (fictional)",
    deposit_offers: "$20k down, drive today on selected units",
    best_sellers: "Nissan Tiida, Toyota Aqua, Honda Fit",
    locations: "Demo Main Road, Princes Town (fictional)",
    opening_hours: "Mon–Sat 8am–5pm",
    lead_whatsapp: "+18685550121",
  };
  await db.update(schema.clients).set({ intake, brandColours: ["#2E6BFF", "#FFFFFF"], pageUrl: "https://facebook.com/demo-princes-town-auto-hub" }).where(eq(schema.clients.id, active.id));
  const [existingPlan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.clientId, active.id));
  if (!existingPlan) {
    const ad = { creativeId: null, name: "Demo — $20k down Tiida", format: "4:5", primaryText: "$20k down, drive today on selected units. Nissan Tiida in stock in Princes Town — WhatsApp us for photos and price.", headline: "Drive today", cta: "Send WhatsApp message", mediaNote: "Tiida on the lot" };
    await db.insert(schema.campaignPlans).values({
      clientId: active.id,
      name: "Demo — Click-to-WhatsApp",
      template: "ctwa",
      objective: "OUTCOME_ENGAGEMENT",
      audiences: [{ name: "T&T broad", type: "broad", ageMin: 18, ageMax: 65, genders: "all", interests: [], notes: "Broad audience" }],
      locations: [{ name: "Trinidad and Tobago (whole country)", radiusKm: null }],
      placements: { mode: "advantage", list: [] },
      budgetType: "daily",
      budgetUsdCents: 2500,
      schedule: { start: "2026-09-01", end: null },
      specialAdCategory: "FINANCIAL_PRODUCTS_SERVICES",
      specialAdCategoryConfirmed: true,
      ads: [ad],
      status: "live",
      launchedAt: daysAgo(60),
      isDemo: true,
    });
    const ok = { ok: true, checked: 2, mismatches: [], checkedAt: new Date().toISOString() };
    await db.insert(schema.creatives).values([
      { clientId: active.id, format: "4:5", hook: "$20k down, drive today", primaryText: "$20k down, drive today on selected units. Nissan Tiida, Toyota Aqua and Honda Fit on the lot. WhatsApp us for today's stock.", headline: "Drive today", cta: "Send WhatsApp message", status: "live", honestyCheck: ok, isDemo: true },
      { clientId: active.id, format: "9:16", hook: "Toyota Aqua in stock", primaryText: "Toyota Aqua available now in Princes Town. WhatsApp us for photos, price and a test drive.", headline: "In stock now", cta: "Send WhatsApp message", status: "client_review", honestyCheck: { ...ok, checked: 0 }, isDemo: true },
      { clientId: active.id, format: "1:1", hook: "$15k down this weekend!", primaryText: "Weekend special: $15k down on any Tiida.", headline: "Weekend deal", cta: "Send WhatsApp message", status: "draft", honestyCheck: { ok: false, checked: 1, mismatches: [{ claim: "$15k", reason: "“$15k” isn't in the client's intake answers" }], checkedAt: new Date().toISOString() }, isDemo: true },
    ]);
  }

  // Two demo approvals so the queue isn't empty on first sign-in.
  await db
    .insert(schema.approvals)
    .values([
      {
        itemType: "outreach_opener",
        title: "First message to Demo — Caroni Plains Auto",
        summary: "WhatsApp opener · fit score 9",
        preview: { body: "Hi Ravi, Matthias here. Saw the 2019 Nissan Tiida on your page — nice unit. I run Facebook/Instagram ads for car dealers in T&T that bring buyers straight to WhatsApp. Mind if I send a quick idea for your page? No pressure." },
        riskLevel: "medium",
        requestedBy: "routine:outreach_batch",
        dedupeKey: "demo:opener:caroni",
        isDemo: true,
      },
      {
        itemType: "system_test",
        title: "Welcome to AgencyOS — approve me to test the log",
        summary: "Demo item. Approving it writes an entry to the audit log.",
        preview: { body: "Nothing is sent when you approve this." },
        riskLevel: "low",
        requestedBy: "system",
        dedupeKey: "demo:welcome",
        isDemo: true,
      },
    ])
    .onConflictDoNothing({ target: schema.approvals.dedupeKey });
}

async function promoteOwner(email: string) {
  const res = await db.update(schema.profiles).set({ role: "owner" }).where(sql`lower(${schema.profiles.email}) = ${email.toLowerCase()}`).returning({ id: schema.profiles.id });
  if (!res[0]) {
    console.warn(`  No Supabase user with email ${email} yet. Create the user in Supabase → Authentication, then rerun with --owner.`);
    return;
  }
  await db.update(schema.settings).set({ ownerEmail: email.toLowerCase() }).where(eq(schema.settings.id, 1));
  await db.insert(schema.auditLog).values({ actorType: "system", actorId: "seed", action: "profile.promoted_owner", entityTable: "profiles", entityId: res[0].id });
  console.log(`  ${email} is now the owner.`);
}

async function main() {
  if (flag("wipe")) {
    console.log("Wiping demo data…");
    await wipe();
  } else {
    console.log("Seeding reference data…");
    const nicheIds = await reference();
    if (!flag("no-demo")) {
      console.log("Seeding demo data (is_demo = true)…");
      await demo(nicheIds);
    }
    await db.insert(schema.auditLog).values({ actorType: "system", actorId: "seed", action: "seed.ran", details: { demo: !flag("no-demo") } });
  }
  const owner = option("owner");
  if (owner) await promoteOwner(owner);
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => client.end());
