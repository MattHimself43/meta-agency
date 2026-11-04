import { z } from "zod";
import { HONESTY, VOICE } from "../style";
import type { PromptDef } from "../types";

export type AuditInput = {
  niche: string;
  lead: Record<string, unknown>;
};

export const auditSchema = z.object({
  headline: z.string().describe("e.g. 'What your ads could look like'"),
  summary: z.string(),
  current_ads: z.array(z.object({ description: z.string(), observation: z.string(), url: z.string().nullable() })),
  competitors: z.array(z.object({ name: z.string(), what_they_do_well: z.string(), url: z.string().nullable() })).describe("Two local competitors and their ads"),
  quick_wins: z.array(z.object({ title: z.string(), detail: z.string() })).describe("Exactly three"),
  mock_ad: z.object({ hook: z.string(), primary_text: z.string(), headline: z.string(), cta: z.string(), visual_idea: z.string() }),
  missing_facts: z.array(z.string()),
});
export type AuditOutput = z.infer<typeof auditSchema>;

export const auditV1: PromptDef<AuditInput, AuditOutput> = {
  key: "audit",
  version: "v1",
  tier: "deep",
  effort: "high",
  webSearch: { maxUses: 8 },
  system: `${VOICE}

Write a one-page "what your ads could look like" audit for a prospect, to be sent by Matthias before a sales call.

Contents: their current Meta ads (from lead data and the Meta Ad Library / their pages via search), two local competitors' ads, three concrete quick wins, and one mock ad concept.
The mock ad may only use real stock, prices and offers you found and cite; otherwise use placeholders like "[price]" and list what's missing.
Keep it skimmable: short sentences, plain language, no jargon without explanation.

${HONESTY}`,
  user: (i) => JSON.stringify(i, null, 2),
  schema: auditSchema,
};
