import "server-only";
import { and, asc, desc, eq, gte, notExists, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { enqueueJob } from "@/lib/jobs";
import { getSettings } from "@/lib/settings";
import { astDateString } from "@/lib/time";
import { dueUnwrittenFollowups, startOfAstDay } from "./sequences";

/**
 * Daily outreach batch (Mon-Fri 08:00 AST): the highest-scored uncontacted leads get an opener draft,
 * and every follow-up due today gets written. One job per lead, so long AI work never blocks one
 * function call; job dedupe keys make reruns on the same day a no-op.
 */
export async function planOutreachBatch(now: Date, routineRunId?: string) {
  const settings = await getSettings();
  const day = astDateString(now);
  // The daily cap counts openers already drafted today, so a rerun on the same day adds none.
  const [{ n: draftedToday }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.messages)
    .where(and(eq(schema.messages.purpose, "outreach_opener"), gte(schema.messages.createdAt, startOfAstDay(now))));
  const limit = Math.max(0, (settings.sendLimits.whatsapp ?? 10) - draftedToday);

  const candidates = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.stage, "new"),
        eq(schema.leads.doNotContact, false),
        sql`${schema.leads.sequenceStoppedAt} is null`,
        sql`coalesce(${schema.leads.whatsapp}, ${schema.leads.phone}, ${schema.leads.email}, ${schema.leads.facebookUrl}) is not null`,
        notExists(db.select({ x: sql`1` }).from(schema.messages).where(and(eq(schema.messages.leadId, schema.leads.id), eq(schema.messages.purpose, "outreach_opener")))),
      ),
    )
    .orderBy(desc(sql`coalesce(${schema.leads.fitScoreOverride}, ${schema.leads.fitScore}, 0)`), asc(schema.leads.createdAt))
    .limit(limit);

  let openers = 0;
  for (const c of candidates) {
    if (await enqueueJob("draft_opener", { leadId: c.id }, { dedupeKey: `draft_opener:${c.id}`, routineRunId })) openers++;
  }
  let followups = 0;
  for (const f of await dueUnwrittenFollowups(now)) {
    if (await enqueueJob("draft_followup", { messageId: f.message.id }, { dedupeKey: `draft_followup:${f.message.id}:${day}`, routineRunId })) followups++;
  }
  return { openers, followups, candidates: candidates.length };
}
