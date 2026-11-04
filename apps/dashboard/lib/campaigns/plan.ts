import { z } from "zod";
import { CATEGORY_LABEL, RESTRICTED_RULES, type SpecialCategory } from "./special-category";

/** Shapes stored in campaign_plans JSON columns. */
export const audienceSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["broad", "interests", "retargeting", "lookalike"]),
  ageMin: z.number().int().min(18).max(65),
  ageMax: z.number().int().min(18).max(65),
  genders: z.enum(["all", "men", "women"]),
  interests: z.array(z.string().max(80)).max(25),
  notes: z.string().max(500).optional(),
});
export const locationSchema = z.object({ name: z.string().min(1).max(80), radiusKm: z.number().min(1).max(200).nullable() });
export const placementsSchema = z.object({ mode: z.enum(["advantage", "manual"]), list: z.array(z.string()).max(20) });
export const scheduleSchema = z.object({ start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() });
export const planAdSchema = z.object({
  creativeId: z.string().uuid().nullable(),
  name: z.string().max(120),
  format: z.enum(["1:1", "4:5", "9:16"]),
  primaryText: z.string().max(2000),
  headline: z.string().max(200),
  cta: z.string().max(60),
  mediaNote: z.string().max(300),
});
export type Audience = z.infer<typeof audienceSchema>;
export type Location = z.infer<typeof locationSchema>;
export type Placements = z.infer<typeof placementsSchema>;
export type Schedule = z.infer<typeof scheduleSchema>;
export type PlanAd = z.infer<typeof planAdSchema>;

export type CampaignTemplate = { key: string; name: string; objective: string; destination: string; specialAdCategory: string | null; note?: string };

export const OBJECTIVE_LABEL: Record<string, string> = {
  OUTCOME_ENGAGEMENT: "Engagement",
  OUTCOME_LEADS: "Leads",
  OUTCOME_TRAFFIC: "Traffic",
  OUTCOME_AWARENESS: "Awareness",
  OUTCOME_SALES: "Sales",
};
export const DESTINATION_LABEL: Record<string, string> = { WHATSAPP: "WhatsApp", ON_AD: "Instant form (on the ad)", WEBSITE: "Website", MESSENGER: "Messenger" };
export const PLACEMENTS = ["Facebook Feed", "Instagram Feed", "Instagram Stories", "Instagram Reels", "Facebook Reels", "Facebook Stories", "Facebook Marketplace", "Instagram Explore"];
export const TT_LOCATIONS = ["Trinidad and Tobago (whole country)", "Port of Spain", "San Fernando", "Chaguanas", "Arima", "Couva", "Point Fortin", "Sangre Grande", "Diego Martin", "Tunapuna", "Princes Town", "Siparia", "Scarborough"];

/** Sensible starting plan for a template. Everything is editable before approval. */
export function defaultPlan(t: CampaignTemplate, opts: { dailyUsdCents: number; specialCategory: SpecialCategory }) {
  const restricted = Boolean(opts.specialCategory);
  const retargeting = /retarget/i.test(t.key);
  return {
    objective: t.objective,
    audiences: [
      retargeting
        ? { name: "Engaged in last 60 days", type: "retargeting" as const, ageMin: 18, ageMax: 65, genders: "all" as const, interests: [], notes: "Custom audience: people who engaged with the Page/Instagram or messaged in the last 60 days" }
        : { name: "Trinidad & Tobago broad", type: "broad" as const, ageMin: restricted ? 18 : 25, ageMax: 65, genders: "all" as const, interests: [], notes: "Broad audience — let Meta find buyers" },
    ],
    locations: [{ name: "Trinidad and Tobago (whole country)", radiusKm: null }],
    placements: { mode: "advantage" as const, list: [] },
    budgetType: "daily" as const,
    budgetUsdCents: opts.dailyUsdCents,
    schedule: { start: null, end: null },
  };
}

export type ChecklistInput = {
  plan: {
    name: string;
    objective: string;
    budgetType: string;
    budgetUsdCents: number;
    audiences: Audience[];
    locations: Location[];
    placements: Placements;
    schedule: Schedule;
    specialAdCategory: SpecialCategory;
    ads: PlanAd[];
  };
  template: CampaignTemplate | null;
  client: { name: string; adAccountId: string | null; pageUrl: string | null; instagramHandle: string | null; leadWhatsapp: string | null };
};

export type ChecklistStep = { n: number; title: string; items: string[]; warning?: string };

/**
 * Manual mode: the exact Ads Manager clicks for this plan, numbered. Ends with the campaign OFF —
 * it only goes live when the owner presses Launch in AgencyOS and then turns it on in Ads Manager.
 */
export function buildChecklist({ plan, template, client }: ChecklistInput): ChecklistStep[] {
  const steps: Omit<ChecklistStep, "n">[] = [];
  const act = client.adAccountId?.replace(/^act_/, "");
  const destination = template?.destination ?? "WHATSAPP";
  const usd = (c: number) => `US$${(c / 100).toFixed(2)}`;

  steps.push({
    title: "Open the client's ad account",
    items: [
      act ? `Go to https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act}` : "Open Ads Manager and switch to the client's ad account (ad account ID missing — add it on the client page)",
      `Check the account name says ${client.name} and that the payment method is the client's own card`,
    ],
    warning: act ? undefined : "No ad account ID recorded for this client",
  });
  steps.push({
    title: "Confirm the account spending limit",
    items: ["Billing & payments → Payment settings → Account spending limit", "Make sure a limit is set (required before any launch)"],
  });
  steps.push({
    title: "Create the campaign",
    items: [
      "Click + Create",
      `Buying type: Auction · Objective: ${OBJECTIVE_LABEL[plan.objective] ?? plan.objective}`,
      `Campaign name: ${plan.name}`,
      plan.specialAdCategory
        ? `Special ad categories: declare “${CATEGORY_LABEL[plan.specialAdCategory]}” and country Trinidad and Tobago`
        : "Special ad categories: leave empty (none apply — double-check if the copy mentions financing or property)",
      plan.budgetType === "daily" ? `Advantage campaign budget: OFF (budget is set on the ad set)` : `Advantage campaign budget: ON · lifetime budget ${usd(plan.budgetUsdCents)}`,
    ],
    warning: plan.specialAdCategory ? "Special ad category — targeting is restricted (see the audience step)" : undefined,
  });

  const adSetItems = [
    `Ad set name: ${plan.name} — ${plan.audiences[0]?.name ?? "Audience"}`,
    destination === "WHATSAPP"
      ? `Conversion location: Messaging apps → WhatsApp${client.leadWhatsapp ? ` · number ${client.leadWhatsapp}` : " · connect the client's WhatsApp Business number"}`
      : destination === "ON_AD"
        ? "Conversion location: Instant forms"
        : `Conversion location: ${DESTINATION_LABEL[destination] ?? destination}`,
    destination === "WHATSAPP" ? "Performance goal: Maximise number of conversations" : destination === "ON_AD" ? "Performance goal: Maximise number of leads" : "Performance goal: as suggested for the objective",
    plan.budgetType === "daily" ? `Budget: Daily ${usd(plan.budgetUsdCents)}` : "Budget: set on the campaign (lifetime)",
    `Schedule: start ${plan.schedule.start ?? "today, after approval"}${plan.schedule.end ? ` · end ${plan.schedule.end}` : " · no end date"}`,
  ];
  steps.push({ title: "Set up the ad set", items: adSetItems, warning: destination === "WHATSAPP" && !client.leadWhatsapp ? "WhatsApp number for leads missing from the intake form" : undefined });

  const audienceItems: string[] = [];
  for (const l of plan.locations) audienceItems.push(`Location: ${l.name}${l.radiusKm ? ` + ${l.radiusKm} km` : ""}`);
  for (const a of plan.audiences) {
    audienceItems.push(
      `${a.name}: ${a.type === "retargeting" ? "Custom audience" : a.type === "lookalike" ? "Lookalike" : a.type === "interests" ? "Detailed targeting" : "Broad (Advantage+ audience)"} · age ${a.ageMin}–${a.ageMax === 65 ? "65+" : a.ageMax} · ${a.genders === "all" ? "all genders" : a.genders}${a.interests.length ? ` · interests: ${a.interests.join(", ")}` : ""}${a.notes ? ` — ${a.notes}` : ""}`,
    );
  }
  if (plan.specialAdCategory) audienceItems.push(...RESTRICTED_RULES.map((r) => `Restricted: ${r}`));
  steps.push({ title: "Audience", items: audienceItems });

  steps.push({
    title: "Placements",
    items: plan.placements.mode === "advantage" ? ["Advantage+ placements (recommended)"] : ["Manual placements — tick only:", ...plan.placements.list.map((p) => `• ${p}`)],
  });

  plan.ads.forEach((ad, i) => {
    steps.push({
      title: `Ad ${i + 1}: ${ad.name || "Untitled"}`,
      items: [
        `Identity: Facebook Page ${client.pageUrl ?? "(client Page)"}${client.instagramHandle ? ` · Instagram @${client.instagramHandle.replace(/^@/, "")}` : ""}`,
        `Format: single image or video · aspect ratio ${ad.format}`,
        `Media: ${ad.mediaNote || "upload the approved creative"}`,
        `Primary text: ${ad.primaryText}`,
        `Headline: ${ad.headline}`,
        `Call to action: ${ad.cta}`,
        destination === "WHATSAPP" ? "Destination: WhatsApp · add a greeting message (e.g. “Hi! I saw your ad, is this still available?”)" : destination === "ON_AD" ? "Destination: Instant form (next step)" : "Destination: as set in the ad set",
      ],
      warning: !ad.primaryText || !ad.headline ? "Copy missing — finish it in the plan first" : undefined,
    });
  });
  if (!plan.ads.length) steps.push({ title: "Ads", items: ["No ads in this plan yet — add approved creatives first"], warning: "Plan has no ads" });

  if (destination === "ON_AD") {
    steps.push({
      title: "Instant form",
      items: ["Form type: Higher intent", "Questions: Full name, Phone number (prefill), one qualifying question", "Privacy policy: the client's website or a simple privacy page", "Completion message: “Thanks! We'll WhatsApp you shortly.”"],
    });
  }

  steps.push({
    title: "Save it switched OFF",
    items: [
      "Review the whole campaign for errors",
      "Turn the campaign toggle OFF, then click Publish — it saves without spending",
      "Copy the campaign ID (and ad set / ad IDs) into the plan in AgencyOS and press “Mark built (paused)”",
      "Only switch it ON after you press Launch in AgencyOS",
    ],
  });
  return steps.map((s, i) => ({ ...s, n: i + 1 }));
}
