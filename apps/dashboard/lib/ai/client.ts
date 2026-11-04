import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { db, schema } from "@/lib/db";
import { estimateCostMicros, type UsageTotals } from "./pricing";
import type { PromptDef, Tier } from "./types";

export class AiUnavailableError extends Error {
  constructor() {
    super("AI is not configured (set ANTHROPIC_API_KEY).");
  }
}
export class AiRefusalError extends Error {}

export function aiAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function modelFor(tier: Tier): string {
  return tier === "deep" ? (process.env.AI_MODEL_DEEP ?? "claude-opus-5-5") : (process.env.AI_MODEL_FAST ?? "claude-sonnet-5-5");
}

let client: Anthropic | undefined;
function anthropic() {
  if (!aiAvailable()) throw new AiUnavailableError();
  return (client ??= new Anthropic());
}

export type AiResult<O> = { output: O; usageId: string; model: string; promptVersion: string };

/**
 * Run a versioned prompt and return schema-validated output. Every call — success or failure —
 * is recorded in ai_usage with its prompt version, model, input snapshot, tokens and estimated cost.
 */
export async function runPrompt<I, O>(def: PromptDef<I, O>, input: I, purpose: string): Promise<AiResult<O>> {
  const model = modelFor(def.tier);
  const totals: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, webSearches: 0 };
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: `<input>\n${def.user(input)}\n</input>` }];
  let output: O | null = null;
  let error: string | null = null;
  let servedModel = model;

  try {
    // pause_turn: long server-tool turns (web search) can pause; send the turn back to continue.
    for (let turn = 0; turn < 4; turn++) {
      const res = await anthropic().beta.messages.parse({
        model,
        max_tokens: def.maxTokens ?? 16000,
        system: def.system,
        messages,
        output_config: { effort: def.effort, format: betaZodOutputFormat(def.schema) },
        ...(def.webSearch ? { tools: [{ type: "web_search_20260209" as const, name: "web_search" as const, max_uses: def.webSearch.maxUses }] } : {}),
        // Server-side refusal fallback: a declined request is retried on a suitable model in the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      servedModel = res.model;
      totals.input += res.usage.input_tokens;
      totals.output += res.usage.output_tokens;
      totals.cacheRead += res.usage.cache_read_input_tokens ?? 0;
      totals.cacheWrite += res.usage.cache_creation_input_tokens ?? 0;
      totals.webSearches += res.usage.server_tool_use?.web_search_requests ?? 0;

      if (res.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: res.content });
        continue;
      }
      if (res.stop_reason === "refusal") throw new AiRefusalError(`The model declined this request${res.stop_details?.category ? ` (${res.stop_details.category})` : ""}.`);
      if (res.stop_reason === "max_tokens") throw new Error("AI output was cut off (max_tokens).");
      if (res.parsed_output == null) throw new Error("AI output did not match the expected format.");
      output = res.parsed_output as O;
      break;
    }
    if (output == null) throw new Error("AI did not finish after several turns.");
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const [row] = await db
    .insert(schema.aiUsage)
    .values({
      purpose,
      promptKey: def.key,
      promptVersion: def.version,
      model: servedModel,
      inputTokens: totals.input,
      outputTokens: totals.output,
      cacheReadTokens: totals.cacheRead,
      cacheWriteTokens: totals.cacheWrite,
      costUsdMicros: estimateCostMicros(servedModel, totals),
      inputSnapshot: input as unknown,
      output: output as unknown,
      ok: error == null,
      error,
    })
    .returning({ id: schema.aiUsage.id });

  if (error != null) throw new Error(error);
  return { output: output!, usageId: row!.id, model: servedModel, promptVersion: def.version };
}
