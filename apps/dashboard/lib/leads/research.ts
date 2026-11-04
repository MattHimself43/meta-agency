import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { runPrompt } from "@/lib/ai/client";
import { adCheck, leadResearch } from "@/lib/ai/prompts";
import { computeFitScore, type ScoringRule } from "./scoring";
import { createLead } from "./service";

/** T&T areas the weekly lead refresh rotates through. */
export const TT_AREAS = [
  "Port of Spain", "San Fernando", "Chaguanas", "Arima", "Couva", "Diego Martin", "Tunapuna", "Sangre Grande",
  "Point Fortin", "Princes Town", "Siparia", "Penal", "Marabella", "St. Augustine", "Trincity", "Scarborough (Tobago)",
];

/** One research job: find up to `count` new leads for a niche in an area. Duplicates are skipped. */
export async function researchLeads(input: { nicheId: string; area: string; count: number; routineRunId?: string | null }) {
  const [niche] = await db.select().from(schema.niches).where(eq(schema.niches.id, input.nicheId));
  if (!niche) throw new Error("Niche not found");
  const exclude = await db
    .select({ business_name: schema.leads.businessName, facebook_url: schema.leads.facebookUrl, phone: schema.leads.phoneNormalized })
    .from(schema.leads)
    .where(sql`${schema.leads.nicheId} = ${input.nicheId} and (${schema.leads.area} ilike ${"%" + input.area.split(" ")[0] + "%"} or ${schema.leads.area} is null)`)
    .limit(200);
  const rules = niche.scoringRules as ScoringRule[];
  const res = await runPrompt(
    leadResearch,
    { niche_slug: niche.slug, niche_name: niche.name, area: input.area, count: input.count, scoring_signals: rules.map((r) => ({ key: r.key, label: r.label })), exclude },
    "lead_research",
  );

  let created = 0;
  let duplicates = 0;
  for (const l of res.output.leads.slice(0, input.count)) {
    if (!l.business_name?.trim()) continue;
    const signals = Object.fromEntries(Object.entries(l.signals).filter(([, v]) => typeof v === "number")) as Record<string, number>;
    const r = await createLead(
      {
        businessName: l.business_name,
        nicheId: niche.id,
        area: l.area ?? input.area,
        contactName: l.contact_name,
        phone: l.phone,
        whatsapp: l.whatsapp,
        email: l.email,
        facebookUrl: l.facebook_url,
        instagramUrl: l.instagram_url,
        website: l.website,
        mapsUrl: l.maps_url,
        source: "ai_research",
        sourceUrls: l.sources,
        runsMetaAds: l.runs_meta_ads,
        adCount: l.ad_count,
        adNotes: l.ad_notes,
        adLinks: l.ad_links,
        signals,
        facts: l.facts,
      },
      { type: "ai", id: res.usageId },
    );
    if (r.status === "created") created++;
    else duplicates++;
  }
  return { created, duplicates, found: res.output.leads.length, notes: res.output.notes };
}

/** Recheck one lead's Meta ad activity and rescore it. */
export async function checkAds(leadId: string) {
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
  if (!lead) return { skipped: true };
  const res = await runPrompt(
    adCheck,
    { business_name: lead.businessName, facebook_url: lead.facebookUrl, instagram_url: lead.instagramUrl, website: lead.website, area: lead.area },
    "ad_check",
  );
  const o = res.output;
  const signals = { ...lead.signals, ...(o.ad_activity_signal != null ? { ad_activity: o.ad_activity_signal } : {}) };
  let fit = { score: lead.fitScore, reasons: lead.scoreReasons as string[] };
  if (lead.nicheId) {
    const [niche] = await db.select().from(schema.niches).where(eq(schema.niches.id, lead.nicheId));
    if (niche) fit = computeFitScore(niche.scoringRules as ScoringRule[], signals);
  }
  const startedAds = lead.runsMetaAds === false && o.runs_meta_ads === true;
  await db
    .update(schema.leads)
    .set({
      runsMetaAds: o.runs_meta_ads ?? lead.runsMetaAds,
      adCount: o.ad_count ?? lead.adCount,
      adNotes: [o.ad_notes, o.running_since ? `Running ${o.running_since}.` : null].filter(Boolean).join(" ") || lead.adNotes,
      adLinks: o.ad_links.length ? o.ad_links : lead.adLinks,
      sourceUrls: [...lead.sourceUrls, ...o.sources].slice(-30),
      signals,
      fitScore: fit.score,
      scoreReasons: fit.reasons,
    })
    .where(eq(schema.leads.id, leadId));
  if (startedAds) {
    await db.insert(schema.activities).values({ leadId, type: "note", body: "Started running Meta ads (ad check).", metadata: { links: o.ad_links } });
  }
  return { runsMetaAds: o.runs_meta_ads, startedAds };
}
