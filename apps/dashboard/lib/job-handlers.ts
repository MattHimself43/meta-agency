import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { jobHandlers } from "@/lib/jobs";
import { draftOpener, draftStep } from "@/lib/outreach/sequences";
import { checkAds, researchLeads } from "@/lib/leads/research";
import { generateCallBrief } from "@/lib/docs/generate";

/** Register every job type. Imported by the dispatcher and by anything that drains the queue inline. */
let registered = false;
export function registerJobHandlers() {
  if (registered) return;
  registered = true;

  jobHandlers.draft_opener = async (job) => draftOpener(String(job.payload.leadId), "routine:outreach_batch");

  jobHandlers.draft_followup = async (job) => {
    const [row] = await db
      .select({ message: schema.messages, lead: schema.leads, step: schema.sequenceSteps })
      .from(schema.messages)
      .innerJoin(schema.leads, eq(schema.leads.id, schema.messages.leadId))
      .innerJoin(schema.sequenceSteps, eq(schema.sequenceSteps.id, schema.messages.sequenceStepId))
      .where(eq(schema.messages.id, String(job.payload.messageId)));
    if (!row || row.message.status !== "draft" || row.message.body) return { skipped: true };
    return draftStep(row.lead, row.step, { requestedBy: "routine:outreach_batch", existing: row.message });
  };

  jobHandlers.lead_research = async (job) =>
    researchLeads({ nicheId: String(job.payload.nicheId), area: String(job.payload.area), count: Number(job.payload.count ?? 5) });

  jobHandlers.ad_check = async (job) => checkAds(String(job.payload.leadId));

  jobHandlers.call_brief = async (job) =>
    generateCallBrief(String(job.payload.leadId), { bookingId: job.payload.bookingId ? String(job.payload.bookingId) : undefined, actorId: null });
}
