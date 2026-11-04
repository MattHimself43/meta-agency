import { z } from "zod";
import { HONESTY, VOICE } from "../style";
import type { PromptDef } from "../types";

/* ---------- Kickoff: first-month plan once onboarding is complete ---------- */
export type KickoffInput = {
  niche: string;
  client: { name: string; package: string; includes: string[]; monthly_budget_usd: number | null; kpi_targets: unknown };
  intake: Record<string, string>;
  campaign_templates: { key: string; name: string }[];
};
export const kickoffSchema = z.object({
  goals: z.array(z.string()),
  offer: z.string().describe("The main offer to lead with, using only intake facts"),
  audiences: z.array(z.string()),
  budget_split: z.array(z.object({ campaign: z.string(), share_pct: z.number(), why: z.string() })),
  first_creative_ideas: z.array(z.object({ hook: z.string(), visual: z.string() })),
  first_week: z.array(z.string()),
  missing_facts: z.array(z.string()),
});
export type KickoffOutput = z.infer<typeof kickoffSchema>;
export const kickoffV1: PromptDef<KickoffInput, KickoffOutput> = {
  key: "kickoff_plan",
  version: "v1",
  tier: "deep",
  effort: "high",
  system: `${VOICE}\n\nWrite the first-month plan for a new client of a Meta ads agency in Trinidad and Tobago: goals, the offer to lead with, audiences, how to split the budget across 1–3 of the given campaign templates, 3–5 first creative ideas, and what happens in week one.\nThe offer and creative ideas may only use facts from the intake answers.\n\n${HONESTY}`,
  user: (i) => JSON.stringify(i, null, 2),
  schema: kickoffSchema,
};

/* ---------- Creative copy ---------- */
export type CopyInput = { niche: string; client: string; intake: Record<string, string>; campaign: string | null; destination: string | null; count: number; avoid: string[] };
export const copySchema = z.object({
  ads: z.array(z.object({ hook: z.string(), primary_text: z.string(), headline: z.string(), cta: z.string() })),
  missing_facts: z.array(z.string()),
});
export type CopyOutput = z.infer<typeof copySchema>;
export const creativeCopyV1: PromptDef<CopyInput, CopyOutput> = {
  key: "creative_copy",
  version: "v1",
  tier: "fast",
  effort: "medium",
  maxTokens: 6000,
  system: `${VOICE}\n\nWrite Facebook/Instagram ad copy for a Trinidad and Tobago business. For each ad: a hook (under 8 words), primary text (under 60 words, ends with a clear next step), a headline (under 6 words) and a Meta call-to-action button label (e.g. "Send WhatsApp message", "Get quote", "Learn more", "Sign up").\nTone examples: "$20k down, drive today" for dealers; "What's your home worth?" for sellers.\nEvery price, deposit, rate, term, stock item and location must come word-for-word from the intake answers — an automatic check rejects any number that isn't there. Vary the angle across ads (offer, stock, trust, urgency, question). Don't repeat anything in "avoid".\n\n${HONESTY}`,
  user: (i) => JSON.stringify(i, null, 2),
  schema: copySchema,
};

/* ---------- Report narrative (weekly / monthly) ---------- */
export type ReportInput = {
  type: "weekly" | "monthly";
  client: string;
  period: string;
  metrics: unknown;
  target_cost_per_result_usd: number | null;
  best_ad: unknown;
  worst_ad: unknown;
  changes_made: string[];
  next_package: string | null;
};
export const reportSchema = z.object({
  headline: z.string().describe("One plain sentence summing up the period"),
  what_happened: z.array(z.string()),
  what_worked: z.array(z.string()),
  what_changes: z.array(z.string()).describe("What we'll change next week / next month"),
  upsell: z.string().nullable().describe("Monthly only: suggest the next package only if results clearly justify it; else null"),
  whatsapp_summary: z.string().describe("Under 60 words for WhatsApp"),
});
export type ReportOutput = z.infer<typeof reportSchema>;
export const reportNarrativeV1: PromptDef<ReportInput, ReportOutput> = {
  key: "report_narrative",
  version: "v1",
  tier: "deep",
  effort: "medium",
  maxTokens: 4000,
  system: `${VOICE}\n\nWrite a client report for a busy business owner in plain language: no jargon (say "cost per WhatsApp chat", not "CPR"), money as US$ for ad spend. Use only the numbers given — never estimate or invent results. If results were poor, say so plainly and say what we're changing.\n\n${HONESTY}`,
  user: (i) => JSON.stringify(i, null, 2),
  schema: reportSchema,
};
