import type { Audience, CampaignTemplate, Location, Placements, PlanAd, Schedule } from "@/lib/campaigns/plan";

/**
 * Pure mapping from an approved AgencyOS plan to Marketing API create payloads.
 * Every object is created with status PAUSED; nothing here can set ACTIVE (see guard.ts).
 */

/** Approximate town centres for radius targeting (Meta needs coordinates, not names). */
export const TT_COORDS: Record<string, { lat: number; lng: number }> = {
  "Port of Spain": { lat: 10.6596, lng: -61.5019 },
  "San Fernando": { lat: 10.2797, lng: -61.4589 },
  Chaguanas: { lat: 10.5167, lng: -61.4114 },
  Arima: { lat: 10.6374, lng: -61.2823 },
  Couva: { lat: 10.4228, lng: -61.4081 },
  "Point Fortin": { lat: 10.1745, lng: -61.6844 },
  "Sangre Grande": { lat: 10.5869, lng: -61.1311 },
  "Diego Martin": { lat: 10.7208, lng: -61.5662 },
  Tunapuna: { lat: 10.6433, lng: -61.3884 },
  "Princes Town": { lat: 10.2667, lng: -61.3833 },
  Siparia: { lat: 10.1333, lng: -61.5 },
  Scarborough: { lat: 11.1833, lng: -60.7333 },
};

const PLACEMENT_MAP: Record<string, { platform: "facebook" | "instagram"; position: string }> = {
  "Facebook Feed": { platform: "facebook", position: "feed" },
  "Facebook Reels": { platform: "facebook", position: "facebook_reels" },
  "Facebook Stories": { platform: "facebook", position: "story" },
  "Facebook Marketplace": { platform: "facebook", position: "marketplace" },
  "Instagram Feed": { platform: "instagram", position: "stream" },
  "Instagram Stories": { platform: "instagram", position: "story" },
  "Instagram Reels": { platform: "instagram", position: "reels" },
  "Instagram Explore": { platform: "instagram", position: "explore" },
};

const CTA_MAP: Record<string, string> = {
  "send whatsapp message": "WHATSAPP_MESSAGE",
  "whatsapp us": "WHATSAPP_MESSAGE",
  "learn more": "LEARN_MORE",
  "sign up": "SIGN_UP",
  "get quote": "GET_QUOTE",
  "contact us": "CONTACT_US",
  "send message": "MESSAGE_PAGE",
  "apply now": "APPLY_NOW",
  "get offer": "GET_OFFER",
  "book now": "BOOK_NOW",
};

export type BuildInputs = {
  plan: {
    id: string;
    name: string;
    objective: string;
    template: string;
    budgetType: "daily" | "lifetime";
    budgetUsdCents: number;
    audiences: Audience[];
    locations: Location[];
    placements: Placements;
    schedule: Schedule;
    specialAdCategory: string | null;
    ads: PlanAd[];
  };
  template: CampaignTemplate | null;
  pageId: string;
  instagramUserId?: string | null;
  leadFormId?: string | null;
  /** creativeId → uploaded image hash */
  imageHashes: Record<string, string>;
  /** interest name → Meta interest id (from targeting search) */
  interestIds: Record<string, string>;
};

export type MetaSpecs = {
  campaign: Record<string, unknown>;
  adSets: Record<string, unknown>[];
  creatives: Record<string, unknown>[];
  /** ads[i] goes into every ad set; creative index i */
  ads: { name: string; creativeIndex: number }[];
  warnings: string[];
};

/** "2026-11-04" → "2026-11-04T00:00:00-0400" (AST has no daylight saving). */
function astStart(day: string, endOfDay = false) {
  return `${day}T${endOfDay ? "23:59:00" : "00:00:00"}-0400`;
}

export function targetingFor(a: Audience, locations: Location[], placements: Placements, interestIds: Record<string, string>, restricted: boolean, warnings: string[]) {
  const custom = locations
    .filter((l) => !/whole country/i.test(l.name))
    .map((l) => {
      const c = TT_COORDS[l.name];
      if (!c) {
        warnings.push(`No coordinates for “${l.name}” — add it in Ads Manager.`);
        return null;
      }
      // Restricted categories need at least a 15-mile radius.
      const km = Math.max(l.radiusKm ?? (restricted ? 25 : 15), restricted ? 25 : 1);
      return { latitude: c.lat, longitude: c.lng, radius: km, distance_unit: "kilometer" };
    })
    .filter(Boolean);
  const whole = locations.length === 0 || locations.some((l) => /whole country/i.test(l.name)) || custom.length === 0;
  const t: Record<string, unknown> = {
    geo_locations: whole ? { countries: ["TT"], location_types: ["home", "recent"] } : { custom_locations: custom, location_types: ["home", "recent"] },
    age_min: restricted ? 18 : a.ageMin,
    age_max: restricted ? 65 : a.ageMax,
    targeting_automation: { advantage_audience: a.type === "broad" ? 1 : 0 },
  };
  if (!restricted && a.genders !== "all") t.genders = [a.genders === "men" ? 1 : 2];
  const ids = a.interests.map((n) => ({ name: n, id: interestIds[n] })).filter((i) => i.id);
  const missing = a.interests.filter((n) => !interestIds[n]);
  if (missing.length) warnings.push(`Interests not found in Meta's targeting search (add by hand if needed): ${missing.join(", ")}.`);
  if (ids.length && !restricted) t.flexible_spec = [{ interests: ids }];
  if (a.type === "retargeting" || a.type === "lookalike") warnings.push(`Audience “${a.name}” is ${a.type}: attach the custom audience in Ads Manager before launch.`);
  if (placements.mode === "manual" && placements.list.length) {
    const mapped = placements.list.map((p) => PLACEMENT_MAP[p]).filter(Boolean) as { platform: string; position: string }[];
    t.publisher_platforms = [...new Set(mapped.map((m) => m.platform))];
    const fb = mapped.filter((m) => m.platform === "facebook").map((m) => m.position);
    const ig = mapped.filter((m) => m.platform === "instagram").map((m) => m.position);
    if (fb.length) t.facebook_positions = fb;
    if (ig.length) t.instagram_positions = ig;
  }
  return t;
}

export function ctaType(label: string) {
  return CTA_MAP[label.trim().toLowerCase()] ?? "LEARN_MORE";
}

export function planToMetaSpecs(i: BuildInputs): MetaSpecs {
  const warnings: string[] = [];
  const { plan } = i;
  const destination = i.template?.destination ?? "WHATSAPP";
  const restricted = Boolean(plan.specialAdCategory);
  if (!plan.ads.length) throw new Error("The plan has no ads.");
  if (destination === "ON_AD" && !i.leadFormId) throw new Error("Lead form campaigns need the instant form ID (create the form in Meta, paste its ID on the plan).");
  if (plan.budgetType === "lifetime" && !plan.schedule.end) throw new Error("A lifetime budget needs an end date.");

  const campaign: Record<string, unknown> = {
    name: plan.name,
    objective: plan.objective,
    status: "PAUSED",
    special_ad_categories: plan.specialAdCategory ? [plan.specialAdCategory] : [],
    ...(plan.specialAdCategory ? { special_ad_category_country: ["TT"] } : {}),
    is_adset_budget_sharing_enabled: false,
  };

  const audiences = plan.audiences.length ? plan.audiences : [{ name: "T&T broad", type: "broad", ageMin: 18, ageMax: 65, genders: "all", interests: [] } as Audience];
  const share = Math.floor(plan.budgetUsdCents / audiences.length);
  if (audiences.length > 1) warnings.push(`Budget split evenly: US$${(share / 100).toFixed(2)} per ad set.`);
  const goal =
    destination === "WHATSAPP"
      ? { destination_type: "WHATSAPP", optimization_goal: "CONVERSATIONS" }
      : destination === "ON_AD"
        ? { destination_type: "ON_AD", optimization_goal: "LEAD_GENERATION" }
        : destination === "MESSENGER"
          ? { destination_type: "MESSENGER", optimization_goal: "CONVERSATIONS" }
          : { destination_type: "WEBSITE", optimization_goal: "LINK_CLICKS" };

  const adSets = audiences.map((a) => ({
    name: `${plan.name} — ${a.name}`,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    ...goal,
    promoted_object: { page_id: i.pageId },
    ...(plan.budgetType === "daily" ? { daily_budget: share } : { lifetime_budget: share }),
    ...(plan.schedule.start ? { start_time: astStart(plan.schedule.start) } : {}),
    ...(plan.schedule.end ? { end_time: astStart(plan.schedule.end, true) } : {}),
    targeting: targetingFor(a, plan.locations, plan.placements, i.interestIds, restricted, warnings),
  }));

  const creatives = plan.ads.map((ad, idx) => {
    const hash = ad.creativeId ? i.imageHashes[ad.creativeId] : undefined;
    if (!hash) throw new Error(`Ad ${idx + 1} (“${ad.name}”) needs an image: pick a creative that has media attached.`);
    const type = destination === "WHATSAPP" ? "WHATSAPP_MESSAGE" : destination === "ON_AD" ? (ctaType(ad.cta) === "WHATSAPP_MESSAGE" ? "SIGN_UP" : ctaType(ad.cta)) : ctaType(ad.cta);
    const cta =
      destination === "WHATSAPP"
        ? { type, value: { app_destination: "WHATSAPP" } }
        : destination === "ON_AD"
          ? { type, value: { lead_gen_form_id: i.leadFormId } }
          : { type };
    return {
      name: `${plan.name} — ${ad.name || `Ad ${idx + 1}`}`,
      object_story_spec: {
        page_id: i.pageId,
        ...(i.instagramUserId ? { instagram_user_id: i.instagramUserId } : {}),
        link_data: {
          message: ad.primaryText,
          name: ad.headline,
          image_hash: hash,
          link: destination === "WHATSAPP" ? "https://api.whatsapp.com/send" : "https://www.facebook.com/",
          call_to_action: cta,
        },
      },
    };
  });

  return { campaign, adSets, creatives, ads: plan.ads.map((ad, idx) => ({ name: ad.name || `Ad ${idx + 1}`, creativeIndex: idx })), warnings };
}
