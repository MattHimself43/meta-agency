import { z } from "zod";
import { HONESTY } from "../style";
import type { PromptDef } from "../types";

export type AdCheckInput = { business_name: string; facebook_url: string | null; instagram_url: string | null; website: string | null; area: string | null };

export const adCheckSchema = z.object({
  runs_meta_ads: z.boolean().nullable().describe("null when you could not tell"),
  ad_count: z.number().nullable(),
  running_since: z.string().nullable().describe("e.g. 'about 4 months', from Ad Library start dates"),
  ad_notes: z.string().describe("How basic the ads are: boosted posts? WhatsApp/lead-form buttons? same creative reused?"),
  ad_links: z.array(z.string()),
  ad_activity_signal: z.number().nullable().describe("0-1: high when they run ads but basic ones"),
  sources: z.array(z.object({ fact: z.string(), url: z.string() })),
});
export type AdCheckOutput = z.infer<typeof adCheckSchema>;

export const adCheckV1: PromptDef<AdCheckInput, AdCheckOutput> = {
  key: "ad_check",
  version: "v1",
  tier: "fast",
  effort: "low",
  maxTokens: 4000,
  webSearch: { maxUses: 4 },
  system: `Check whether a Trinidad and Tobago business currently runs Meta (Facebook/Instagram) ads, using the Meta Ad Library (country: Trinidad and Tobago) as surfaced in search results and the business's own pages.
Report how many ads, how long they've run, and how basic they are, with links. If you cannot find evidence either way, set runs_meta_ads to null — never guess.

${HONESTY}`,
  user: (i) => JSON.stringify(i, null, 2),
  schema: adCheckSchema,
};
