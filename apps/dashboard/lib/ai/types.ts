import type { z } from "zod";

export type Tier = "fast" | "deep";
export type Effort = "low" | "medium" | "high";

/** A versioned prompt. Bump `version` whenever the system text or schema changes. */
export type PromptDef<I, O> = {
  key: string;
  version: string;
  tier: Tier;
  effort: Effort;
  maxTokens?: number;
  /** Allow Anthropic's server-side web search, capped at this many searches. */
  webSearch?: { maxUses: number };
  system: string;
  user: (input: I) => string;
  schema: z.ZodType<O>;
};
