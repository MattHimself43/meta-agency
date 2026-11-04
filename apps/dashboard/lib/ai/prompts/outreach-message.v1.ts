import { z } from "zod";
import { HONESTY, VOICE } from "../style";
import type { PromptDef } from "../types";

export type OutreachInput = {
  purpose: "opener" | "followup_day3" | "followup_day7";
  channel: "whatsapp" | "email" | "dm";
  niche: string;
  lead: {
    business_name: string;
    contact_name: string | null;
    area: string | null;
    runs_meta_ads: boolean | null;
    ad_count: number | null;
    ad_notes: string | null;
    facts: { fact: string; url?: string }[];
    score_reasons: unknown;
  };
  template_examples: string[];
  previous_messages: string[];
};

export const outreachSchema = z.object({
  variants: z.array(z.string()).describe("Exactly two different message variants"),
  personal_hook: z.string().nullable().describe("The specific, real fact about the business each variant references, or null if none was available"),
  missing_facts: z.array(z.string()),
});
export type OutreachOutput = z.infer<typeof outreachSchema>;

export const outreachMessageV1: PromptDef<OutreachInput, OutreachOutput> = {
  key: "outreach_message",
  version: "v1",
  tier: "fast",
  effort: "medium",
  maxTokens: 4000,
  system: `${VOICE}

You draft cold outreach messages from Matthias to local businesses (car dealers, real estate agents and developers).

Rules for every message:
- Openers must name something real and specific about the business taken from lead.facts or lead.ad_notes (a recent post, a car or listing in stock, a gap in their ads). If there is nothing specific, write a polite generic opener and set personal_hook to null and say so in missing_facts.
- WhatsApp and DM: under 60 words. Email: under 110 words, plain text, no subject line in the body.
- One clear, low-pressure ask (e.g. "Can I send a quick idea?"). No links. Sign as Matthias.
- Follow-ups (day 3) are a light nudge that adds one small piece of value; the day-7 message is a short, gracious last nudge that makes it easy to say no.
- Write two variants that differ in angle, not just wording.

${HONESTY}`,
  user: (i) => JSON.stringify(i, null, 2),
  schema: outreachSchema,
};
