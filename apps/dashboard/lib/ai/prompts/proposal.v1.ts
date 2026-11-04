import { z } from "zod";
import { HONESTY, VOICE } from "../style";
import type { PromptDef } from "../types";

export type ProposalInput = {
  niche: string;
  lead: Record<string, unknown>;
  call_notes: string;
  packages: { slug: string; name: string; setup_fee_ttd: number; monthly_fee_ttd: number; includes: string[]; recommended_spend: string | null; terms: string | null }[];
  founding_offer: { enabled: boolean; slots_left: number };
  agency_name: string;
};

export const proposalSchema = z.object({
  title: z.string(),
  intro: z.string(),
  goals: z.array(z.string()),
  plan: z.array(z.object({ phase: z.string(), detail: z.string() })),
  package_slug: z.string(),
  why_this_package: z.string(),
  ad_spend_note: z.string().describe("Ad spend is paid by the client directly to Meta, in US$, with a recommended range"),
  terms: z.string(),
  next_steps: z.array(z.string()),
  missing_facts: z.array(z.string()),
});
export type ProposalOutput = z.infer<typeof proposalSchema>;

export const proposalV1: PromptDef<ProposalInput, ProposalOutput> = {
  key: "proposal",
  version: "v1",
  tier: "deep",
  effort: "high",
  system: `${VOICE}

Turn Matthias's call notes into a short proposal for the prospect.
Pick exactly one package from the list (use its slug). Prices come only from the package list — never write a different price. If the founding-client offer is enabled and slots are left, mention the setup fee is waived.
The client owns their Facebook Page and ad account and pays Meta directly with their own card; the agency fee covers management only.
Plain language, short sections, no promises of specific results.

${HONESTY}`,
  user: (i) => JSON.stringify(i, null, 2),
  schema: proposalSchema,
};
