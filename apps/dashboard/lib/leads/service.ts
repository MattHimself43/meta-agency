import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema, type Tx } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { normalizeTtPhone } from "@/lib/phone";
import { createClientFromLead } from "@/lib/clients/onboard";
import { stopSequence } from "@/lib/outreach/sequences";
import { computeFitScore, type ScoringRule } from "./scoring";
import { normalizeFacebookUrl, normalizeUrl } from "./normalize";

export type Lead = typeof schema.leads.$inferSelect;
export type Stage = Lead["stage"];

export const STAGES: { key: Stage; label: string }[] = [
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "replied", label: "Replied" },
  { key: "call_booked", label: "Call booked" },
  { key: "proposal_sent", label: "Proposal sent" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
  { key: "nurture", label: "Nurture" },
];
export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.key, s.label])) as Record<Stage, string>;

export type LeadInput = {
  businessName: string;
  nicheId?: string | null;
  area?: string | null;
  contactName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  facebookUrl?: string | null;
  instagramUrl?: string | null;
  website?: string | null;
  mapsUrl?: string | null;
  source?: string | null;
  sourceUrls?: { fact: string; url: string }[];
  runsMetaAds?: boolean | null;
  adCount?: number | null;
  adNotes?: string | null;
  adLinks?: string[];
  signals?: Record<string, number>;
  facts?: { fact: string; url?: string }[];
  notes?: string | null;
  isDemo?: boolean;
};

/** Find an existing lead that this input duplicates (same normalised phone/WhatsApp or Facebook page). */
export async function findDuplicate(input: Pick<LeadInput, "phone" | "whatsapp" | "facebookUrl">, tx: Tx | typeof db = db) {
  const phones = [normalizeTtPhone(input.phone), normalizeTtPhone(input.whatsapp)].filter(Boolean) as string[];
  const fb = normalizeFacebookUrl(input.facebookUrl);
  const conds = [];
  if (phones.length) conds.push(inArray(schema.leads.phoneNormalized, phones));
  if (fb) conds.push(eq(schema.leads.facebookUrl, fb));
  if (!conds.length) return null;
  const [row] = await tx.select().from(schema.leads).where(or(...conds)).limit(1);
  return row ?? null;
}

/** Create a lead unless it's a duplicate. Scores it from its niche rules. */
export async function createLead(input: LeadInput, actor: { type: "user" | "routine" | "ai" | "system" | "portal"; id?: string | null }) {
  return db.transaction(async (tx) => {
    const dup = await findDuplicate(input, tx);
    if (dup) return { status: "duplicate" as const, lead: dup };

    const phoneNormalized = normalizeTtPhone(input.phone) ?? normalizeTtPhone(input.whatsapp);
    const whatsapp = normalizeTtPhone(input.whatsapp) ?? phoneNormalized;
    let fitScore: number | null = null;
    let scoreReasons: string[] = [];
    if (input.nicheId) {
      const [niche] = await tx.select().from(schema.niches).where(eq(schema.niches.id, input.nicheId));
      if (niche && input.signals) ({ score: fitScore, reasons: scoreReasons } = computeFitScore(niche.scoringRules as ScoringRule[], input.signals));
    }
    const [lead] = await tx
      .insert(schema.leads)
      .values({
        businessName: input.businessName.trim(),
        nicheId: input.nicheId ?? null,
        area: input.area?.trim() || null,
        contactName: input.contactName?.trim() || null,
        phone: phoneNormalized ?? (input.phone?.trim() || null),
        phoneNormalized,
        whatsapp,
        email: input.email?.trim().toLowerCase() || null,
        facebookUrl: normalizeFacebookUrl(input.facebookUrl),
        instagramUrl: normalizeUrl(input.instagramUrl),
        website: normalizeUrl(input.website),
        mapsUrl: normalizeUrl(input.mapsUrl),
        source: input.source ?? "manual",
        sourceUrls: input.sourceUrls ?? [],
        runsMetaAds: input.runsMetaAds ?? null,
        adCount: input.adCount ?? null,
        adNotes: input.adNotes ?? null,
        adLinks: input.adLinks ?? [],
        signals: input.signals ?? {},
        facts: input.facts ?? [],
        fitScore,
        scoreReasons,
        isDemo: input.isDemo ?? false,
        createdBy: actor.type === "user" ? (actor.id ?? null) : null,
      })
      .onConflictDoNothing()
      .returning();
    if (!lead) return { status: "duplicate" as const, lead: (await findDuplicate(input, tx))! };
    if (input.notes) await tx.insert(schema.activities).values({ leadId: lead.id, type: "note", body: input.notes });
    await logAudit({ actorType: actor.type, actorId: actor.id ?? null, action: "lead.created", entityTable: "leads", entityId: lead.id, details: { source: lead.source } }, tx);
    return { status: "created" as const, lead };
  });
}

/** Recompute fit scores from stored signals (overrides are kept separately and always win). */
export async function rescoreLeads(leadIds?: string[]) {
  const niches = await db.select().from(schema.niches);
  const rules = new Map(niches.map((n) => [n.id, n.scoringRules as ScoringRule[]]));
  const leads = await db
    .select({ id: schema.leads.id, nicheId: schema.leads.nicheId, signals: schema.leads.signals })
    .from(schema.leads)
    .where(leadIds ? inArray(schema.leads.id, leadIds) : sql`true`);
  let n = 0;
  for (const l of leads) {
    if (!l.nicheId || !Object.keys(l.signals ?? {}).length) continue;
    const { score, reasons } = computeFitScore(rules.get(l.nicheId) ?? [], l.signals);
    await db.update(schema.leads).set({ fitScore: score, scoreReasons: reasons }).where(eq(schema.leads.id, l.id));
    n++;
  }
  return n;
}

export type MoveResult = { lead: Lead; client?: typeof schema.clients.$inferSelect; portalToken?: string | null };

/**
 * Move a lead to a stage. Every move logs a stage_change activity and an audit entry.
 * Won → creates the client (onboarding). Lost requires a reason. Won/Lost/Nurture stop the outreach sequence.
 */
export async function moveStage(leadId: string, to: Stage, actorId: string | null, opts: { lostReason?: string } = {}): Promise<MoveResult> {
  if (to === "lost" && !opts.lostReason?.trim()) throw new Error("Add a reason when moving a lead to Lost.");
  return db.transaction(async (tx) => {
    const [lead] = await tx.select().from(schema.leads).where(eq(schema.leads.id, leadId)).for("update");
    if (!lead) throw new Error("Lead not found");
    if (lead.stage === to) return { lead };

    const [updated] = await tx
      .update(schema.leads)
      .set({ stage: to, lostReason: to === "lost" ? opts.lostReason!.trim() : lead.lostReason })
      .where(eq(schema.leads.id, leadId))
      .returning();
    await tx.insert(schema.activities).values({
      leadId,
      type: "stage_change",
      body: `${STAGE_LABEL[lead.stage]} → ${STAGE_LABEL[to]}${to === "lost" ? ` (${opts.lostReason!.trim()})` : ""}`,
      metadata: { from: lead.stage, to },
      isDemo: lead.isDemo,
      createdBy: actorId,
    });
    await logAudit({ actorType: actorId ? "user" : "system", actorId, action: "lead.stage_changed", entityTable: "leads", entityId: leadId, details: { from: lead.stage, to, lostReason: opts.lostReason ?? null } }, tx);

    if (to === "won" || to === "lost" || to === "nurture" || to === "call_booked") {
      await stopSequence(tx, leadId, to === "call_booked" ? "call booked" : to);
    }
    if (to === "won") {
      const { client, portalToken } = await createClientFromLead(tx, updated!, actorId);
      return { lead: updated!, client, portalToken };
    }
    return { lead: updated! };
  });
}

export async function setDoNotContact(leadId: string, value: boolean, actorId: string | null, reason = "Marked do-not-contact") {
  await db.transaction(async (tx) => {
    await tx.update(schema.leads).set({ doNotContact: value }).where(eq(schema.leads.id, leadId));
    if (value) await stopSequence(tx, leadId, "do not contact");
    await tx.insert(schema.activities).values({ leadId, type: "note", body: value ? reason : "Removed from do-not-contact", createdBy: actorId });
    await logAudit({ actorType: actorId ? "user" : "system", actorId, action: value ? "lead.dnc_on" : "lead.dnc_off", entityTable: "leads", entityId: leadId, details: { reason } }, tx);
  });
}

export async function addNote(leadId: string, body: string, actorId: string, type: "note" | "call" = "note") {
  await db.insert(schema.activities).values({ leadId, type, body, createdBy: actorId });
}

export async function getLead(id: string) {
  const [l] = await db.select().from(schema.leads).where(eq(schema.leads.id, id));
  return l ?? null;
}

/** Leads that may be contacted: not DNC, not won/lost. */
export const contactable = and(eq(schema.leads.doNotContact, false), sql`${schema.leads.stage} not in ('won','lost')`);
