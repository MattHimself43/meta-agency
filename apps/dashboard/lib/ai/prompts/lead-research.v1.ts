import { z } from "zod";
import { HONESTY } from "../style";
import type { PromptDef } from "../types";

export type LeadResearchInput = {
  niche_slug: string;
  niche_name: string;
  area: string;
  count: number;
  scoring_signals: { key: string; label: string }[];
  exclude: { business_name: string; facebook_url: string | null; phone: string | null }[];
};

const signal = z.number().nullable().describe("0 to 1, or null if unknown");
export const leadResearchSchema = z.object({
  leads: z.array(
    z.object({
      business_name: z.string(),
      area: z.string().nullable(),
      contact_name: z.string().nullable(),
      phone: z.string().nullable(),
      whatsapp: z.string().nullable(),
      email: z.string().nullable(),
      facebook_url: z.string().nullable(),
      instagram_url: z.string().nullable(),
      website: z.string().nullable(),
      maps_url: z.string().nullable(),
      runs_meta_ads: z.boolean().nullable(),
      ad_count: z.number().nullable(),
      ad_notes: z.string().nullable().describe("How long they've run ads and how basic they are"),
      ad_links: z.array(z.string()),
      signals: z.object({
        ad_activity: signal,
        inventory_size: signal,
        posting_frequency: signal,
        engagement: signal,
        reviews: signal,
      }),
      facts: z.array(z.object({ fact: z.string(), url: z.string() })).describe("Specific, real details usable in an opener"),
      sources: z.array(z.object({ fact: z.string(), url: z.string() })).describe("Source URL for every field you filled"),
    }),
  ),
  notes: z.string(),
});
export type LeadResearchOutput = z.infer<typeof leadResearchSchema>;

export const leadResearchV1: PromptDef<LeadResearchInput, LeadResearchOutput> = {
  key: "lead_research",
  version: "v1",
  tier: "fast",
  effort: "medium",
  maxTokens: 16000,
  webSearch: { maxUses: 12 },
  system: `You research prospective clients in Trinidad and Tobago for a Meta (Facebook/Instagram) ads agency.

Find real, currently operating businesses in the requested niche and area. Good sources: Google Maps listings, the business's Facebook and Instagram pages, their website, the T&T Ministry of Trade dealer list (car dealers), real estate association listings, and the Meta Ad Library (country: Trinidad and Tobago) as surfaced in search results.

For each business:
- Fill only fields you actually found. Leave others null. Phone numbers as found (local formats are fine).
- runs_meta_ads / ad_count / ad_notes / ad_links from Meta Ad Library results when available; otherwise null.
- signals: your 0-1 estimate for each scoring signal, null when you have no evidence.
  ad_activity is HIGH when they run ads but basic ones (boosted posts, no WhatsApp button) — that is the best fit for the agency.
- facts: 1-3 specific details (a recent post, a vehicle or listing on offer) with the URL.
- sources: one entry per filled field, with the URL where you found it.

Skip any business in the exclude list (match on name, Facebook URL or phone). Skip businesses outside T&T. Return at most the requested count; fewer is fine if you can't verify more.

${HONESTY}`,
  user: (i) => JSON.stringify(i, null, 2),
  schema: leadResearchSchema,
};
