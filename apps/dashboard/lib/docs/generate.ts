import "server-only";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { aiAvailable, runPrompt } from "@/lib/ai/client";
import { audit as auditPrompt, callBrief as briefPrompt, proposal as proposalPrompt } from "@/lib/ai/prompts";
import type { AuditOutput } from "@/lib/ai/prompts/audit.v1";
import type { CallBriefOutput } from "@/lib/ai/prompts/call-brief.v1";
import type { ProposalOutput } from "@/lib/ai/prompts/proposal.v1";
import { generateToken, hashToken } from "@/lib/crypto";
import { getSettings } from "@/lib/settings";

export type DocKind = "audit" | "call_brief" | "proposal";
export const DOC_TABLE = { audit: schema.audits, call_brief: schema.callBriefs, proposal: schema.proposals } as const;
export const DOC_LABEL: Record<DocKind, string> = { audit: "Ads audit", call_brief: "Call brief", proposal: "Proposal" };

type Meta = { _meta: { prompt: string; version: string; model: string | null; source: "ai" | "skeleton"; generatedAt: string } };
export type AuditContent = AuditOutput & Meta;
export type BriefContent = CallBriefOutput & Meta & { booking?: string | null };
export type ProposalContent = ProposalOutput & Meta & { call_notes: string };

async function leadContext(leadId: string) {
  const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, leadId));
  if (!lead) throw new Error("Lead not found");
  const [niche] = lead.nicheId ? await db.select().from(schema.niches).where(eq(schema.niches.id, lead.nicheId)) : [];
  const leadData = {
    business_name: lead.businessName,
    area: lead.area,
    contact_name: lead.contactName,
    website: lead.website,
    facebook_url: lead.facebookUrl,
    instagram_url: lead.instagramUrl,
    runs_meta_ads: lead.runsMetaAds,
    ad_count: lead.adCount,
    ad_notes: lead.adNotes,
    ad_links: lead.adLinks,
    facts: lead.facts,
    score_reasons: lead.scoreReasons,
  };
  return { lead, niche, leadData, nicheName: niche?.name ?? "local business" };
}

async function packageList() {
  const pkgs = await db.select().from(schema.packages).where(eq(schema.packages.active, true)).orderBy(asc(schema.packages.sortOrder));
  return pkgs.map((p) => ({ slug: p.slug, name: p.name, setup_fee_ttd: p.setupFeeCents / 100, monthly_fee_ttd: p.monthlyFeeCents / 100, includes: p.includes, recommended_spend: p.recommendedSpend, terms: p.terms }));
}

const meta = (prompt: string, version: string, model: string | null, source: "ai" | "skeleton") => ({ _meta: { prompt, version, model, source, generatedAt: new Date().toISOString() } });

async function save(kind: DocKind, leadId: string, content: unknown, aiRunId: string | null, actorId: string | null, isDemo: boolean) {
  const table = DOC_TABLE[kind];
  const [row] = await db.insert(table).values({ leadId, content, aiRunId, isDemo, createdBy: actorId }).returning();
  await logAudit({ actorType: aiRunId ? "ai" : actorId ? "user" : "system", actorId: actorId ?? aiRunId, action: `${kind}.drafted`, entityTable: kind === "call_brief" ? "call_briefs" : `${kind}s`, entityId: row!.id, details: { leadId } });
  return row!;
}

export async function generateAudit(leadId: string, actorId: string | null) {
  const { lead, leadData, nicheName } = await leadContext(leadId);
  if (aiAvailable()) {
    const r = await runPrompt(auditPrompt, { niche: nicheName, lead: leadData }, "audit");
    return save("audit", leadId, { ...r.output, ...meta(auditPrompt.key, r.promptVersion, r.model, "ai") }, r.usageId, actorId, lead.isDemo);
  }
  const skeleton: AuditContent = {
    headline: `What ${lead.businessName}'s ads could look like`,
    summary: "Draft skeleton — AI is not configured, so research and wording need to be filled in by hand.",
    current_ads: lead.adNotes ? [{ description: `${lead.adCount ?? "Some"} active ad(s)`, observation: lead.adNotes, url: lead.adLinks[0] ?? null }] : [],
    competitors: [],
    quick_wins: [
      { title: "Send ad clicks straight to WhatsApp", detail: "[Fill in once you've reviewed their current ads]" },
      { title: "Lead with a real offer", detail: "[Use their actual stock / price / deposit offer]" },
      { title: "Retarget people who engaged", detail: "[Explain retargeting in one sentence]" },
    ],
    mock_ad: { hook: "[Hook]", primary_text: "[Primary text using a real offer]", headline: "[Headline]", cta: "Send WhatsApp message", visual_idea: "[Their best-selling unit or listing]" },
    missing_facts: ["AI not configured (set ANTHROPIC_API_KEY)", "Competitor ads", "Current offers and prices"],
    ...meta(auditPrompt.key, auditPrompt.version, null, "skeleton"),
  };
  return save("audit", leadId, skeleton, null, actorId, lead.isDemo);
}

export async function generateCallBrief(leadId: string, opts: { bookingId?: string; actorId: string | null }) {
  const { lead, leadData, nicheName } = await leadContext(leadId);
  const [booking] = opts.bookingId ? await db.select().from(schema.bookings).where(eq(schema.bookings.id, opts.bookingId)) : [];
  const acts = await db.select().from(schema.activities).where(eq(schema.activities.leadId, leadId)).orderBy(desc(schema.activities.occurredAt)).limit(30);
  const pkgs = await packageList();
  let row;
  if (aiAvailable()) {
    const r = await runPrompt(
      briefPrompt,
      { niche: nicheName, lead: leadData, activities: acts.map((a) => ({ type: a.type, body: a.body, at: a.occurredAt.toISOString() })), packages: pkgs, call_time: booking?.startsAt.toISOString() ?? null },
      "call_brief",
    );
    row = await save("call_brief", leadId, { ...r.output, booking: booking?.id ?? null, ...meta(briefPrompt.key, r.promptVersion, r.model, "ai") }, r.usageId, opts.actorId, lead.isDemo);
  } else {
    const recommended = pkgs.find((p) => p.slug === "growth") ?? pkgs[0];
    const skeleton: BriefContent = {
      snapshot: `${lead.businessName}${lead.area ? `, ${lead.area}` : ""}. ${lead.adNotes ?? "No ad notes yet."}`,
      stock_or_listings: lead.facts.map((f) => f.fact),
      current_ads: lead.adNotes ? [lead.adNotes] : [],
      competitors: [],
      likely_objections: [
        { objection: "We tried boosting posts and it didn't work.", response: "Boosted posts optimise for likes; we set campaigns to optimise for WhatsApp chats and leads." },
        { objection: "It's too expensive.", response: "You control the ad spend with your own card; start on Starter and scale only if the cost per chat is right." },
      ],
      questions_to_ask: ["Where do most of your buyers come from today?", "What's your best-selling unit / listing right now?", "Who answers WhatsApp enquiries, and how fast?"],
      suggested_package_slug: recommended?.slug ?? "growth",
      suggested_price_note: recommended ? `${recommended.name}: TT$${recommended.setup_fee_ttd.toLocaleString()} setup + TT$${recommended.monthly_fee_ttd.toLocaleString()}/month` : "",
      missing_facts: ["AI not configured (set ANTHROPIC_API_KEY)", "Competitors", "Current stock or listings"],
      booking: booking?.id ?? null,
      ...meta(briefPrompt.key, briefPrompt.version, null, "skeleton"),
    };
    row = await save("call_brief", leadId, skeleton, null, opts.actorId, lead.isDemo);
  }
  if (booking) await db.update(schema.bookings).set({ callBriefId: row.id }).where(eq(schema.bookings.id, booking.id));
  return row;
}

export async function generateProposal(leadId: string, callNotes: string, actorId: string | null) {
  const { lead, leadData, nicheName } = await leadContext(leadId);
  const settings = await getSettings();
  const pkgs = await packageList();
  const [{ waived }] = (await db.execute(sql`SELECT count(*)::int AS waived FROM clients WHERE setup_fee_waived`)) as unknown as [{ waived: number }];
  const founding = { enabled: settings.foundingOfferEnabled, slots_left: Math.max(0, settings.foundingOfferSlots - waived) };
  if (aiAvailable()) {
    const r = await runPrompt(proposalPrompt, { niche: nicheName, lead: leadData, call_notes: callNotes, packages: pkgs, founding_offer: founding, agency_name: settings.agencyName }, "proposal");
    const slug = pkgs.some((p) => p.slug === r.output.package_slug) ? r.output.package_slug : (pkgs.find((p) => p.slug === "growth")?.slug ?? pkgs[0]!.slug);
    return save("proposal", leadId, { ...r.output, package_slug: slug, call_notes: callNotes, ...meta(proposalPrompt.key, r.promptVersion, r.model, "ai") }, r.usageId, actorId, lead.isDemo);
  }
  const pkg = pkgs.find((p) => p.slug === "growth") ?? pkgs[0]!;
  const skeleton: ProposalContent = {
    title: `Meta ads proposal for ${lead.businessName}`,
    intro: "[Write a two-line intro based on the call]",
    goals: ["[Goal from the call]"],
    plan: [
      { phase: "Week 1", detail: "Onboarding, Meta access and first campaign build (paused until you approve)." },
      { phase: "Weeks 2-4", detail: "Launch, daily optimisation, weekly report." },
    ],
    package_slug: pkg.slug,
    why_this_package: "[Why this package fits]",
    ad_spend_note: `Ad spend is paid by you directly to Meta with your own card${pkg.recommended_spend ? `; we recommend ${pkg.recommended_spend}` : ""}.`,
    terms: pkg.terms ?? "",
    next_steps: ["Approve the proposal", "Sign the agreement in your client portal", "Give us partner access in Meta Business Manager"],
    missing_facts: ["AI not configured (set ANTHROPIC_API_KEY)"],
    call_notes: callNotes,
    ...meta(proposalPrompt.key, proposalPrompt.version, null, "skeleton"),
  };
  return save("proposal", leadId, skeleton, null, actorId, lead.isDemo);
}

/** Approve a document for sending and mint a fresh share link (raw token returned once; only the hash is stored). */
export async function approveAndShare(kind: Exclude<DocKind, "call_brief">, id: string, actorId: string) {
  const table = DOC_TABLE[kind];
  const token = generateToken();
  const [row] = await db.update(table).set({ status: "approved", shareTokenHash: hashToken(token) }).where(eq(table.id, id)).returning();
  if (!row) throw new Error("Document not found");
  await logAudit({ actorType: "user", actorId, action: `${kind}.approved_shared`, entityTable: `${kind}s`, entityId: id, approvedBy: actorId });
  if (kind === "proposal" && row.leadId) {
    const [lead] = await db.select().from(schema.leads).where(eq(schema.leads.id, row.leadId));
    if (lead && ["new", "contacted", "replied", "call_booked"].includes(lead.stage)) {
      const { moveStage } = await import("@/lib/leads/service");
      await moveStage(lead.id, "proposal_sent", actorId);
    }
  }
  return { row, token };
}

export async function findSharedDoc(kind: Exclude<DocKind, "call_brief">, token: string) {
  const table = DOC_TABLE[kind];
  const [row] = await db.select().from(table).where(and(eq(table.shareTokenHash, hashToken(token)), eq(table.status, "approved")));
  return row ?? null;
}
