import { z } from "zod";
import { HONESTY, VOICE } from "../style";
import type { PromptDef } from "../types";

export type CallBriefInput = {
  niche: string;
  lead: Record<string, unknown>;
  activities: { type: string; body: string | null; at: string }[];
  packages: { slug: string; name: string; setup_fee_ttd: number; monthly_fee_ttd: number; includes: string[]; recommended_spend: string | null }[];
  call_time: string | null;
};

export const callBriefSchema = z.object({
  snapshot: z.string(),
  stock_or_listings: z.array(z.string()),
  current_ads: z.array(z.string()),
  competitors: z.array(z.object({ name: z.string(), note: z.string() })),
  likely_objections: z.array(z.object({ objection: z.string(), response: z.string() })),
  questions_to_ask: z.array(z.string()),
  suggested_package_slug: z.string(),
  suggested_price_note: z.string(),
  missing_facts: z.array(z.string()),
});
export type CallBriefOutput = z.infer<typeof callBriefSchema>;

export const callBriefV1: PromptDef<CallBriefInput, CallBriefOutput> = {
  key: "call_brief",
  version: "v1",
  tier: "deep",
  effort: "high",
  webSearch: { maxUses: 6 },
  system: `${VOICE}

Write a one-page brief Matthias reads 5 minutes before a 20-minute discovery call.
Include: who they are, their stock or listings, current ads, competitors, likely objections with a short honest response each, good questions to ask, and the package to suggest with a one-line price note. Choose the package from the list given; never invent prices.

${HONESTY}`,
  user: (i) => JSON.stringify(i, null, 2),
  schema: callBriefSchema,
};
