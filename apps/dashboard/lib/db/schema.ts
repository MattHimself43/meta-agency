/**
 * AgencyOS data model.
 *
 * Conventions
 * - Every table has `id`, `created_at`, `updated_at`, `created_by` (null = system / routine / AI).
 * - Money is integer cents plus a currency column ("USD" | "TTD").
 * - Demo rows from `npm run seed` carry `is_demo = true` so they can be wiped safely.
 * - Row Level Security is enabled on every table in drizzle/0001_security.sql.
 */
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  date,
  jsonb,
  numeric,
  smallint,
  uniqueIndex,
  index,
  check,
  inet,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", ["owner", "account_manager", "none"]);
export const currency = pgEnum("currency", ["USD", "TTD"]);
export const leadStage = pgEnum("lead_stage", [
  "new",
  "contacted",
  "replied",
  "call_booked",
  "proposal_sent",
  "won",
  "lost",
  "nurture",
]);
export const channel = pgEnum("channel", ["whatsapp", "email", "dm", "phone", "portal", "other"]);
export const activityType = pgEnum("activity_type", [
  "message_draft",
  "message_sent",
  "reply",
  "call",
  "note",
  "file",
  "stage_change",
]);
export const messageStatus = pgEnum("message_status", ["draft", "approved", "sent", "replied", "cancelled"]);
export const docStatus = pgEnum("doc_status", ["draft", "approved", "sent", "archived"]);
export const clientStatus = pgEnum("client_status", ["onboarding", "active", "paused", "churned"]);
export const stepStatus = pgEnum("step_status", ["pending", "in_progress", "done", "skipped"]);
export const creativeFormat = pgEnum("creative_format", ["1:1", "4:5", "9:16"]);
export const creativeStatus = pgEnum("creative_status", [
  "draft",
  "starred",
  "client_review",
  "approved",
  "rejected",
  "live",
  "fatigued",
]);
export const campaignStatus = pgEnum("campaign_status", ["draft", "approved", "built_paused", "live", "paused"]);
export const recommendationType = pgEnum("recommendation_type", [
  "pause_ad",
  "shift_budget",
  "new_creative",
  "raise_budget",
  "lower_budget",
]);
export const recommendationStatus = pgEnum("recommendation_status", ["open", "approved", "rejected", "applied", "dismissed"]);
export const reportType = pgEnum("report_type", ["weekly", "monthly"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "approved", "sent", "paid", "overdue", "void"]);
export const riskLevel = pgEnum("risk_level", ["low", "medium", "high"]);
export const approvalStatus = pgEnum("approval_status", ["pending", "approved", "rejected", "auto_approved", "cancelled"]);
export const runStatus = pgEnum("run_status", ["running", "succeeded", "failed", "skipped"]);
export const jobStatus = pgEnum("job_status", ["queued", "running", "succeeded", "failed", "cancelled"]);
export const integrationStatus = pgEnum("integration_status", ["connected", "expired", "not_set_up", "disabled", "error"]);
export const alertSeverity = pgEnum("alert_severity", ["info", "warning", "urgent"]);
export const bookingStatus = pgEnum("booking_status", ["booked", "cancelled", "completed", "no_show"]);

/* ------------------------------------------------------------------ */
/* Shared column helpers                                               */
/* ------------------------------------------------------------------ */

const id = () => uuid("id").primaryKey().defaultRandom();
const timestamps = () => ({
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid("created_by"),
});
const demo = () => boolean("is_demo").notNull().default(false);

/* ------------------------------------------------------------------ */
/* People & settings                                                   */
/* ------------------------------------------------------------------ */

/** One row per Supabase auth user. id = auth.users.id */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  role: userRole("role").notNull().default("none"),
  ...timestamps(),
});

export type FeatureFlags = {
  meta_api: boolean;
  gmail: boolean;
  google_calendar: boolean;
  higgsfield: boolean;
  wipay: boolean;
  team_seats: boolean;
};

export type AutoApproveRules = Record<string, boolean>;

export type WeeklyAvailability = {
  /** 0 = Sunday … 6 = Saturday; times are "HH:mm" in America/Port_of_Spain */
  [weekday: string]: { start: string; end: string }[];
};

/** Single-row table (id is always 1). */
export const settings = pgTable(
  "settings",
  {
    id: smallint("id").primaryKey().default(1),
    agencyName: text("agency_name").notNull().default("[Agency name]"),
    logoPath: text("logo_path"),
    ownerName: text("owner_name").notNull().default("Matthias"),
    ownerEmail: text("owner_email"),
    ownerWhatsapp: text("owner_whatsapp"),
    addressLines: jsonb("address_lines").$type<string[]>().notNull().default(sql`'["[Street address]", "[Town]", "Trinidad and Tobago"]'::jsonb`),
    registrationNumber: text("registration_number").notNull().default("[Registration no. pending]"),
    vatNumber: text("vat_number"),
    bankDetails: jsonb("bank_details")
      .$type<{ bank: string; accountName: string; accountNumber: string; branch: string; accountType: string }>()
      .notNull()
      .default(sql`'{"bank":"[Bank]","accountName":"[Account name]","accountNumber":"[Account number]","branch":"[Branch]","accountType":"[Chequing/Savings]"}'::jsonb`),
    invoicePrefix: text("invoice_prefix").notNull().default("INV-"),
    nextInvoiceNumber: integer("next_invoice_number").notNull().default(1),
    vatEnabled: boolean("vat_enabled").notNull().default(false),
    vatRateBps: integer("vat_rate_bps").notNull().default(1250), // 12.50 %
    invoiceDueDays: integer("invoice_due_days").notNull().default(7),
    /** TTD per 1 USD */
    exchangeRate: numeric("exchange_rate", { precision: 10, scale: 4 }).notNull().default("6.8000"),
    timezone: text("timezone").notNull().default("America/Port_of_Spain"),
    sendLimits: jsonb("send_limits").$type<Record<string, number>>().notNull().default(sql`'{"whatsapp":10,"email":20,"dm":10}'::jsonb`),
    autoApproveRules: jsonb("auto_approve_rules").$type<AutoApproveRules>().notNull().default(sql`'{"followup_day3":false,"followup_day7":false}'::jsonb`),
    /** Budget change (USD cents/day) above which owner approval is always required, regardless of the 20 % rule. */
    budgetChangeLimitCents: integer("budget_change_limit_cents").notNull().default(2000),
    foundingOfferEnabled: boolean("founding_offer_enabled").notNull().default(true),
    foundingOfferSlots: integer("founding_offer_slots").notNull().default(3),
    availability: jsonb("availability").$type<WeeklyAvailability>().notNull().default(sql`'{"1":[{"start":"10:00","end":"16:00"}],"2":[{"start":"10:00","end":"16:00"}],"3":[{"start":"10:00","end":"16:00"}],"4":[{"start":"10:00","end":"16:00"}],"5":[{"start":"10:00","end":"14:00"}]}'::jsonb`),
    digestEmail: text("digest_email"),
    featureFlags: jsonb("feature_flags")
      .$type<FeatureFlags>()
      .notNull()
      .default(sql`'{"meta_api":false,"gmail":false,"google_calendar":false,"higgsfield":false,"wipay":false,"team_seats":false}'::jsonb`),
    ...timestamps(),
  },
  (t) => [check("settings_singleton", sql`${t.id} = 1`)],
);

/* ------------------------------------------------------------------ */
/* Niches, templates, packages                                         */
/* ------------------------------------------------------------------ */

export const niches = pgTable(
  "niches",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    active: boolean("active").notNull().default(true),
    /** [{ key, label, weight, description }] */
    scoringRules: jsonb("scoring_rules").$type<unknown>().notNull().default(sql`'[]'::jsonb`),
    /** { cost_per_whatsapp_chat: { ttd_cents, usd_cents }, ... } */
    kpiTargets: jsonb("kpi_targets").$type<unknown>().notNull().default(sql`'{}'::jsonb`),
    intakeSchema: jsonb("intake_schema").$type<unknown>().notNull().default(sql`'[]'::jsonb`),
    campaignTemplates: jsonb("campaign_templates").$type<unknown>().notNull().default(sql`'[]'::jsonb`),
    ...timestamps(),
  },
  (t) => [uniqueIndex("niches_slug_key").on(t.slug)],
);

export const messageTemplates = pgTable("message_templates", {
  id: id(),
  nicheId: uuid("niche_id").references(() => niches.id, { onDelete: "set null" }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  channel: channel("channel").notNull(),
  purpose: text("purpose").notNull(), // opener | followup_day3 | followup_day7 | reply | onboarding_nudge | invoice_reminder ...
  body: text("body").notNull(),
  sentCount: integer("sent_count").notNull().default(0),
  replyCount: integer("reply_count").notNull().default(0),
  active: boolean("active").notNull().default(true),
  ...timestamps(),
});

export const packages = pgTable(
  "packages",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    recommended: boolean("recommended").notNull().default(false),
    setupFeeCents: bigint("setup_fee_cents", { mode: "number" }).notNull(),
    monthlyFeeCents: bigint("monthly_fee_cents", { mode: "number" }).notNull(),
    currency: currency("currency").notNull().default("TTD"),
    includes: jsonb("includes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    recommendedSpend: text("recommended_spend"),
    terms: text("terms"),
    active: boolean("active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    ...timestamps(),
  },
  (t) => [uniqueIndex("packages_slug_key").on(t.slug)],
);

/* ------------------------------------------------------------------ */
/* Leads & CRM                                                         */
/* ------------------------------------------------------------------ */

export const leads = pgTable(
  "leads",
  {
    id: id(),
    businessName: text("business_name").notNull(),
    nicheId: uuid("niche_id").references(() => niches.id, { onDelete: "set null" }),
    area: text("area"),
    contactName: text("contact_name"),
    /** E.164, e.g. +18685550123 */
    phone: text("phone"),
    phoneNormalized: text("phone_normalized"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    facebookUrl: text("facebook_url"),
    instagramUrl: text("instagram_url"),
    website: text("website"),
    mapsUrl: text("maps_url"),
    source: text("source"),
    sourceUrls: jsonb("source_urls").$type<{ fact: string; url: string }[]>().notNull().default(sql`'[]'::jsonb`),
    runsMetaAds: boolean("runs_meta_ads"),
    adCount: integer("ad_count"),
    adNotes: text("ad_notes"),
    adLinks: jsonb("ad_links").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    fitScore: smallint("fit_score"),
    fitScoreOverride: smallint("fit_score_override"),
    scoreReasons: jsonb("score_reasons").$type<unknown>().notNull().default(sql`'[]'::jsonb`),
    /** Raw scoring inputs: { ad_activity: 0-1, inventory_size: 0-1, ... } — see lib/leads/scoring.ts */
    signals: jsonb("signals").$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    /** Facts gathered by research (recent post, a car in stock, …) used to personalise openers. */
    facts: jsonb("facts").$type<{ fact: string; url?: string }[]>().notNull().default(sql`'[]'::jsonb`),
    stage: leadStage("stage").notNull().default("new"),
    sequenceId: uuid("sequence_id").references(() => sequences.id, { onDelete: "set null" }),
    sequenceStoppedAt: timestamp("sequence_stopped_at", { withTimezone: true }),
    sequenceStopReason: text("sequence_stop_reason"),
    lastContactedAt: timestamp("last_contacted_at", { withTimezone: true }),
    nextAction: text("next_action"),
    nextActionDue: timestamp("next_action_due", { withTimezone: true }),
    doNotContact: boolean("do_not_contact").notNull().default(false),
    lostReason: text("lost_reason"),
    estimatedValueCents: bigint("estimated_value_cents", { mode: "number" }),
    estimatedValueCurrency: currency("estimated_value_currency").notNull().default("TTD"),
    isDemo: demo(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("leads_phone_normalized_key").on(t.phoneNormalized),
    uniqueIndex("leads_facebook_url_key").on(t.facebookUrl),
    index("leads_stage_idx").on(t.stage),
    index("leads_niche_idx").on(t.nicheId),
    check("leads_fit_score_range", sql`${t.fitScore} is null or (${t.fitScore} between 1 and 10)`),
    check("leads_fit_score_override_range", sql`${t.fitScoreOverride} is null or (${t.fitScoreOverride} between 1 and 10)`),
  ],
);


export const clients = pgTable(
  "clients",
  {
    id: id(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    nicheId: uuid("niche_id").references(() => niches.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    whatsapp: text("whatsapp"),
    email: text("email"),
    packageId: uuid("package_id").references(() => packages.id, { onDelete: "set null" }),
    startDate: date("start_date"),
    contractEnd: date("contract_end"),
    status: clientStatus("status").notNull().default("onboarding"),
    /** sha256 of the portal token; the raw token is only shown once. */
    portalTokenHash: text("portal_token_hash"),
    portalTokenRotatedAt: timestamp("portal_token_rotated_at", { withTimezone: true }),
    metaBusinessId: text("meta_business_id"),
    adAccountId: text("ad_account_id"),
    pageId: text("page_id"),
    pixelId: text("pixel_id"),
    monthlyBudgetUsdCents: bigint("monthly_budget_usd_cents", { mode: "number" }),
    kpiTargets: jsonb("kpi_targets").$type<unknown>().notNull().default(sql`'{}'::jsonb`),
    healthScore: smallint("health_score"),
    setupFeeWaived: boolean("setup_fee_waived").notNull().default(false),
    lastContactAt: timestamp("last_contact_at", { withTimezone: true }),
    /** Answers to the niche's intake form (the only facts ads may use). */
    intake: jsonb("intake").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    brandColours: jsonb("brand_colours").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    pageUrl: text("page_url"),
    instagramHandle: text("instagram_handle"),
    isDemo: demo(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("clients_portal_token_hash_key").on(t.portalTokenHash), index("clients_status_idx").on(t.status)],
);

export const activities = pgTable(
  "activities",
  {
    id: id(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    type: activityType("type").notNull(),
    channel: channel("channel"),
    body: text("body"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    isDemo: demo(),
    ...timestamps(),
  },
  (t) => [
    index("activities_lead_idx").on(t.leadId),
    index("activities_client_idx").on(t.clientId),
    check("activities_subject", sql`${t.leadId} is not null or ${t.clientId} is not null`),
  ],
);

export const bookings = pgTable(
  "bookings",
  {
    id: id(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    businessName: text("business_name"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: bookingStatus("status").notNull().default("booked"),
    notes: text("notes"),
    externalEventId: text("external_event_id"),
    callBriefId: uuid("call_brief_id"),
    source: text("source").notNull().default("book_page"), // book_page | manual
    isDemo: demo(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("bookings_slot_key").on(t.startsAt).where(sql`status = 'booked'`)],
);

/* ------------------------------------------------------------------ */
/* Outreach                                                            */
/* ------------------------------------------------------------------ */

export const sequences = pgTable("sequences", {
  id: id(),
  nicheId: uuid("niche_id").references(() => niches.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  active: boolean("active").notNull().default(true),
  ...timestamps(),
});

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: id(),
    sequenceId: uuid("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    stepOrder: smallint("step_order").notNull(),
    dayOffset: smallint("day_offset").notNull(),
    channel: channel("channel").notNull(),
    /** approval item type, e.g. "outreach_opener", "followup_day3" */
    purpose: text("purpose").notNull(),
    templateId: uuid("template_id").references(() => messageTemplates.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("sequence_steps_order_key").on(t.sequenceId, t.stepOrder)],
);

export const messages = pgTable(
  "messages",
  {
    id: id(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    channel: channel("channel").notNull(),
    purpose: text("purpose").notNull(),
    sequenceStepId: uuid("sequence_step_id").references(() => sequenceSteps.id, { onDelete: "set null" }),
    stepOrder: smallint("step_order"),
    /** For reply drafts: the classification of the inbound reply */
    classification: text("classification"),
    templateId: uuid("template_id").references(() => messageTemplates.id, { onDelete: "set null" }),
    variants: jsonb("variants").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    chosenVariant: smallint("chosen_variant"),
    body: text("body"),
    subject: text("subject"),
    status: messageStatus("status").notNull().default("draft"),
    dueAt: timestamp("due_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    /** Idempotency key so reruns don't create duplicate drafts, e.g. "opener:<lead>" */
    dedupeKey: text("dedupe_key"),
    aiRunId: uuid("ai_run_id"),
    isDemo: demo(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("messages_dedupe_key").on(t.dedupeKey), index("messages_status_due_idx").on(t.status, t.dueAt)],
);

/* ------------------------------------------------------------------ */
/* Sales documents                                                     */
/* ------------------------------------------------------------------ */

const salesDoc = (name: string) =>
  pgTable(name, {
    id: id(),
    leadId: uuid("lead_id").references(() => leads.id, { onDelete: "cascade" }),
    content: jsonb("content").$type<unknown>().notNull().default(sql`'{}'::jsonb`),
    pdfPath: text("pdf_path"),
    shareTokenHash: text("share_token_hash"),
    status: docStatus("status").notNull().default("draft"),
    aiRunId: uuid("ai_run_id"),
    isDemo: demo(),
    ...timestamps(),
  });

export const audits = salesDoc("audits");
export const callBriefs = salesDoc("call_briefs");
export const proposals = salesDoc("proposals");

/* ------------------------------------------------------------------ */
/* Clients: onboarding, agreements, assets                             */
/* ------------------------------------------------------------------ */

export const onboardingSteps = pgTable(
  "onboarding_steps",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    label: text("label").notNull(),
    sortOrder: smallint("sort_order").notNull().default(0),
    ownerOnly: boolean("owner_only").notNull().default(false),
    status: stepStatus("status").notNull().default("pending"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    isDemo: demo(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("onboarding_steps_client_step_key").on(t.clientId, t.stepKey)],
);

export const agreements = pgTable("agreements", {
  id: id(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  version: text("version").notNull().default("v1"),
  pdfPath: text("pdf_path"),
  signedPdfPath: text("signed_pdf_path"),
  signatureName: text("signature_name"),
  signatureImagePath: text("signature_image_path"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signedIp: inet("signed_ip"),
  signedUserAgent: text("signed_user_agent"),
  isDemo: demo(),
  ...timestamps(),
});

export const assets = pgTable("assets", {
  id: id(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  type: text("type").notNull(), // photo | video | logo | stock_list | other
  mimeType: text("mime_type"),
  tags: jsonb("tags").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  uploadedVia: text("uploaded_via").notNull().default("dashboard"), // dashboard | portal
  isDemo: demo(),
  ...timestamps(),
});

/* ------------------------------------------------------------------ */
/* Campaigns, creatives, performance                                   */
/* ------------------------------------------------------------------ */

export const campaignPlans = pgTable("campaign_plans", {
  id: id(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  template: text("template").notNull(),
  objective: text("objective").notNull(),
  audiences: jsonb("audiences").$type<unknown>().notNull().default(sql`'[]'::jsonb`),
  locations: jsonb("locations").$type<unknown>().notNull().default(sql`'[]'::jsonb`),
  placements: jsonb("placements").$type<unknown>().notNull().default(sql`'[]'::jsonb`),
  budgetType: text("budget_type").notNull().default("daily"), // daily | lifetime
  budgetUsdCents: bigint("budget_usd_cents", { mode: "number" }).notNull().default(0),
  schedule: jsonb("schedule").$type<unknown>().notNull().default(sql`'{}'::jsonb`),
  specialAdCategory: text("special_ad_category"), // null | CREDIT | HOUSING ...
  specialAdCategoryConfirmed: boolean("special_ad_category_confirmed").notNull().default(false),
  ads: jsonb("ads").$type<unknown>().notNull().default(sql`'[]'::jsonb`),
  status: campaignStatus("status").notNull().default("draft"),
  notes: text("notes"),
  launchedAt: timestamp("launched_at", { withTimezone: true }),
  launchedBy: uuid("launched_by"),
  metaCampaignId: text("meta_campaign_id"),
  metaIds: jsonb("meta_ids").$type<unknown>().notNull().default(sql`'{}'::jsonb`),
  isDemo: demo(),
  ...timestamps(),
});

export const creatives = pgTable("creatives", {
  id: id(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  campaignPlanId: uuid("campaign_plan_id").references(() => campaignPlans.id, { onDelete: "set null" }),
  format: creativeFormat("format").notNull().default("1:1"),
  hook: text("hook"),
  primaryText: text("primary_text"),
  headline: text("headline"),
  cta: text("cta"),
  mediaPath: text("media_path"),
  status: creativeStatus("status").notNull().default("draft"),
  honestyCheck: jsonb("honesty_check").$type<unknown>(),
  honestyOverrideReason: text("honesty_override_reason"),
  clientComment: text("client_comment"),
  metaAdId: text("meta_ad_id"),
  aiRunId: uuid("ai_run_id"),
  isDemo: demo(),
  ...timestamps(),
});

export const performanceDaily = pgTable(
  "performance_daily",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    campaignPlanId: uuid("campaign_plan_id").references(() => campaignPlans.id, { onDelete: "set null" }),
    campaignName: text("campaign_name"),
    adSetName: text("ad_set_name"),
    adName: text("ad_name"),
    metaCampaignId: text("meta_campaign_id"),
    metaAdSetId: text("meta_ad_set_id"),
    metaAdId: text("meta_ad_id"),
    date: date("date").notNull(),
    spendUsdCents: bigint("spend_usd_cents", { mode: "number" }).notNull().default(0),
    impressions: integer("impressions").notNull().default(0),
    reach: integer("reach").notNull().default(0),
    frequency: numeric("frequency", { precision: 8, scale: 3 }),
    clicks: integer("clicks").notNull().default(0),
    ctr: numeric("ctr", { precision: 8, scale: 4 }),
    leads: integer("leads").notNull().default(0),
    whatsappConversations: integer("whatsapp_conversations").notNull().default(0),
    costPerResultUsdCents: bigint("cost_per_result_usd_cents", { mode: "number" }),
    source: text("source").notNull().default("csv"), // csv | api | manual
    isDemo: demo(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("performance_daily_row_key").on(t.clientId, t.date, t.campaignName, t.adSetName, t.adName),
    index("performance_daily_client_date_idx").on(t.clientId, t.date),
  ],
);

export const recommendations = pgTable("recommendations", {
  id: id(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  campaignPlanId: uuid("campaign_plan_id").references(() => campaignPlans.id, { onDelete: "set null" }),
  type: recommendationType("type").notNull(),
  reasoning: text("reasoning").notNull(),
  expectedImpact: text("expected_impact"),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  status: recommendationStatus("status").notNull().default("open"),
  dedupeKey: text("dedupe_key"),
  aiRunId: uuid("ai_run_id"),
  isDemo: demo(),
  ...timestamps(),
}, (t) => [uniqueIndex("recommendations_dedupe_key").on(t.dedupeKey)]);

export const reports = pgTable(
  "reports",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    type: reportType("type").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    content: jsonb("content").$type<unknown>().notNull().default(sql`'{}'::jsonb`),
    pdfPath: text("pdf_path"),
    shareTokenHash: text("share_token_hash"),
    status: docStatus("status").notNull().default("draft"),
    aiRunId: uuid("ai_run_id"),
    isDemo: demo(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("reports_client_period_key").on(t.clientId, t.type, t.periodStart)],
);

/* ------------------------------------------------------------------ */
/* Billing                                                             */
/* ------------------------------------------------------------------ */

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    clientId: uuid("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "restrict" }),
    /** Assigned only when the invoice is approved, so numbering stays sequential with no gaps. */
    number: text("number"),
    kind: text("kind").notNull().default("monthly"), // setup | monthly | other
    /** e.g. "2026-12" for monthly, "setup" for setup — with client_id forms the idempotency key */
    periodKey: text("period_key").notNull(),
    currency: currency("currency").notNull().default("TTD"),
    issueDate: date("issue_date"),
    dueDate: date("due_date"),
    subtotalCents: bigint("subtotal_cents", { mode: "number" }).notNull().default(0),
    vatCents: bigint("vat_cents", { mode: "number" }).notNull().default(0),
    totalCents: bigint("total_cents", { mode: "number" }).notNull().default(0),
    status: invoiceStatus("status").notNull().default("draft"),
    agencySnapshot: jsonb("agency_snapshot").$type<unknown>(),
    clientSnapshot: jsonb("client_snapshot").$type<unknown>(),
    pdfPath: text("pdf_path"),
    paymentLink: text("payment_link"),
    /** Overdue reminders already drafted: { "3": iso, "10": iso, "21": iso } */
    remindersSent: jsonb("reminders_sent").$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    isDemo: demo(),
    ...timestamps(),
  },
  (t) => [uniqueIndex("invoices_number_key").on(t.number), uniqueIndex("invoices_client_period_key").on(t.clientId, t.periodKey)],
);

export const invoiceLines = pgTable("invoice_lines", {
  id: id(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull().default("1"),
  unitCents: bigint("unit_cents", { mode: "number" }).notNull(),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  sortOrder: smallint("sort_order").notNull().default(0),
  isDemo: demo(),
  ...timestamps(),
});

export const payments = pgTable("payments", {
  id: id(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "restrict" }),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: currency("currency").notNull().default("TTD"),
  method: text("method").notNull(), // bank_transfer | wipay | cash | other
  reference: text("reference"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  providerPayload: jsonb("provider_payload").$type<unknown>(),
  isDemo: demo(),
  ...timestamps(),
}, (t) => [uniqueIndex("payments_method_reference_key").on(t.method, t.reference)]);

export const expenses = pgTable("expenses", {
  id: id(),
  date: date("date").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  amountCents: bigint("amount_cents", { mode: "number" }).notNull(),
  currency: currency("currency").notNull().default("TTD"),
  receiptPath: text("receipt_path"),
  isDemo: demo(),
  ...timestamps(),
});

/* ------------------------------------------------------------------ */
/* Approvals, routines, jobs, audit                                    */
/* ------------------------------------------------------------------ */

export const approvals = pgTable(
  "approvals",
  {
    id: id(),
    /** e.g. outreach_opener, followup_day3, campaign_launch, budget_change, invoice, report, creative_pick, system_test */
    itemType: text("item_type").notNull(),
    /** Polymorphic link: table name + row id */
    subjectTable: text("subject_table"),
    subjectId: uuid("subject_id"),
    title: text("title").notNull(),
    summary: text("summary"),
    preview: jsonb("preview").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    riskLevel: riskLevel("risk_level").notNull().default("medium"),
    status: approvalStatus("status").notNull().default("pending"),
    requestedBy: text("requested_by").notNull().default("system"), // "routine:<key>" | "ai" | "user:<uuid>"
    decidedBy: uuid("decided_by"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    dedupeKey: text("dedupe_key"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    isDemo: demo(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("approvals_dedupe_key").on(t.dedupeKey),
    index("approvals_status_idx").on(t.status, t.riskLevel, t.createdAt),
  ],
);

export const routines = pgTable(
  "routines",
  {
    id: id(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** 5-field cron expression evaluated in `timezone` */
    cron: text("cron").notNull(),
    timezone: text("timezone").notNull().default("America/Port_of_Spain"),
    /** For "every 2nd Wednesday": run only on weeks where (weeks since anchor) % n == 0 */
    everyNWeeks: smallint("every_n_weeks").notNull().default(1),
    anchorDate: date("anchor_date"),
    enabled: boolean("enabled").notNull().default(true),
    /** The scheduled occurrence most recently claimed (UTC) */
    lastScheduledFor: timestamp("last_scheduled_for", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    lastStatus: runStatus("last_status"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("routines_key_key").on(t.key)],
);

export const routineRuns = pgTable(
  "routine_runs",
  {
    id: id(),
    routineId: uuid("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    /** The scheduled occurrence this run belongs to (null for Run now) */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    trigger: text("trigger").notNull().default("schedule"), // schedule | manual | retry
    attempt: smallint("attempt").notNull().default(1),
    status: runStatus("status").notNull().default("running"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    durationMs: integer("duration_ms"),
    output: jsonb("output").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    digestLine: text("digest_line"),
    error: text("error"),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex("routine_runs_occurrence_key").on(t.routineId, t.scheduledFor, t.attempt),
    index("routine_runs_routine_idx").on(t.routineId, t.startedAt),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: jobStatus("status").notNull().default("queued"),
    attempts: smallint("attempts").notNull().default(0),
    maxAttempts: smallint("max_attempts").notNull().default(2),
    runAfter: timestamp("run_after", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    result: jsonb("result").$type<unknown>(),
    error: text("error"),
    dedupeKey: text("dedupe_key"),
    routineRunId: uuid("routine_run_id").references(() => routineRuns.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("jobs_dedupe_key").on(t.dedupeKey), index("jobs_queue_idx").on(t.status, t.runAfter)],
);

/** Append-only. UPDATE/DELETE are blocked by a trigger in drizzle/0001_security.sql. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    /** "user" | "routine" | "ai" | "system" | "portal" | "webhook" */
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    entityTable: text("entity_table"),
    entityId: text("entity_id"),
    approvalId: uuid("approval_id"),
    approvedBy: uuid("approved_by"),
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    ip: inet("ip"),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityTable, t.entityId), index("audit_log_at_idx").on(t.at)],
);

export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    provider: text("provider").notNull(), // meta | gmail | google_calendar | higgsfield | wipay | anthropic | resend
    status: integrationStatus("status").notNull().default("not_set_up"),
    /** AES-256-GCM ciphertext (base64: iv.tag.data). Never selected into client components. */
    encryptedToken: text("encrypted_token"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    accountLabel: text("account_label"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps(),
  },
  (t) => [uniqueIndex("integrations_provider_key").on(t.provider)],
);

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    purpose: text("purpose").notNull(),
    promptKey: text("prompt_key").notNull(),
    promptVersion: text("prompt_version").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    /** Estimated cost in USD micro-cents (1e-6 USD) to keep precision */
    costUsdMicros: bigint("cost_usd_micros", { mode: "number" }).notNull().default(0),
    inputSnapshot: jsonb("input_snapshot").$type<unknown>(),
    output: jsonb("output").$type<unknown>(),
    ok: boolean("ok").notNull().default(true),
    error: text("error"),
    ...timestamps(),
  },
  (t) => [index("ai_usage_created_idx").on(t.createdAt)],
);

export const alerts = pgTable(
  "alerts",
  {
    id: id(),
    kind: text("kind").notNull(), // integration_disconnected | campaign_rejected | client_silent | invoice_overdue | onboarding_stuck | routine_failed
    severity: alertSeverity("severity").notNull().default("warning"),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    dedupeKey: text("dedupe_key"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [uniqueIndex("alerts_dedupe_key").on(t.dedupeKey)],
);

/** v2: weekly time tracker */
export const timeEntries = pgTable("time_entries", {
  id: id(),
  date: date("date").notNull(),
  minutes: integer("minutes").notNull(),
  category: text("category"),
  note: text("note"),
  ...timestamps(),
});

/** Public-route rate limiting (fixed window). */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  count: integer("count").notNull().default(0),
});

/** Saved filters on the Leads table. */
export const savedViews = pgTable("saved_views", {
  id: id(),
  page: text("page").notNull().default("leads"),
  name: text("name").notNull(),
  query: text("query").notNull(),
  ...timestamps(),
});

/** Every budget change on a campaign plan. Increases over 20 % in 7 days or above the owner limit need approval. */
export const budgetChanges = pgTable("budget_changes", {
  id: id(),
  campaignPlanId: uuid("campaign_plan_id")
    .notNull()
    .references(() => campaignPlans.id, { onDelete: "cascade" }),
  oldBudgetUsdCents: bigint("old_budget_usd_cents", { mode: "number" }).notNull(),
  newBudgetUsdCents: bigint("new_budget_usd_cents", { mode: "number" }).notNull(),
  status: text("status").notNull().default("pending"), // pending | applied | rejected
  reason: text("reason"),
  approvalId: uuid("approval_id"),
  requestedBy: text("requested_by").notNull().default("user"),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  isDemo: demo(),
  ...timestamps(),
});

/**
 * File bytes for the database storage driver (local dev / when Supabase Storage isn't configured).
 * With SUPABASE_SERVICE_ROLE_KEY set, files live in Supabase Storage and only metadata is kept in assets.
 */
export const storedFiles = pgTable("stored_files", {
  path: text("path").primaryKey(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  data: text("data").notNull(), // base64
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
