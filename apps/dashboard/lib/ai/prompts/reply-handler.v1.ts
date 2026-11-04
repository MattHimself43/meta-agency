import { z } from "zod";
import { HONESTY, VOICE } from "../style";
import type { PromptDef } from "../types";

export type ReplyInput = {
  niche: string;
  lead: { business_name: string; contact_name: string | null };
  conversation: { from: "matthias" | "lead"; text: string }[];
  reply: string;
  booking_link: string;
};

export const replySchema = z.object({
  classification: z.enum(["interested", "question", "not_now", "no", "stop"]),
  summary: z.string().describe("One line: what the prospect said"),
  response_draft: z.string().nullable().describe("A reply for Matthias to approve; null when classification is stop"),
  next_action: z.string().describe("Short next action for the CRM, e.g. 'Send audit', 'Check back in 60 days'"),
  missing_facts: z.array(z.string()),
});
export type ReplyOutput = z.infer<typeof replySchema>;

export const replyHandlerV1: PromptDef<ReplyInput, ReplyOutput> = {
  key: "reply_handler",
  version: "v1",
  tier: "fast",
  effort: "medium",
  maxTokens: 3000,
  system: `${VOICE}

A prospect replied to Matthias's outreach. Classify the reply and draft a response.

Classifications:
- interested: wants to hear more / says yes / asks to talk.
- question: asks something (price, how it works) without committing.
- not_now: open but not the right time.
- no: polite decline.
- stop: asks not to be contacted again, or is hostile. response_draft must be null.

Response drafts: under 60 words, WhatsApp style. For interested: offer the 20-minute call and include the booking link exactly as given. For question: answer only with what you know; if the answer needs facts you don't have (e.g. exact pricing for their case), say Matthias will confirm on a quick call. For not_now: thank them and say you'll check back. For no: thank them briefly, no pushback.

${HONESTY}`,
  user: (i) => JSON.stringify(i, null, 2),
  schema: replySchema,
};
