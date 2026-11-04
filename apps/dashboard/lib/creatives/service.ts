import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { aiAvailable, runPrompt } from "@/lib/ai/client";
import { creativeCopyV1 } from "@/lib/ai/prompts/deliver.v1";
import { checkHonesty, type HonestyResult } from "./honesty";

export type Creative = typeof schema.creatives.$inferSelect;
type Status = Creative["status"];

/** Copy built only from intake answers — used when AI isn't configured. Never adds a number that isn't there. */
export function templateCopy(intake: Record<string, string>, nicheSlug: string | null, count: number) {
  const first = (v?: string) => v?.split(/[\n;]/)[0]?.trim();
  const offer = first(intake.deposit_offers);
  const best = first(intake.best_sellers);
  const area = first(intake.areas) ?? first(intake.locations);
  const out =
    nicheSlug === "real_estate"
      ? [
          { hook: "What's your home worth?", primary_text: `Thinking of selling${area ? ` in ${area}` : ""}? Get a free, no-pressure valuation from a local agent. Tap to WhatsApp us.`, headline: "Free home valuation", cta: "Send WhatsApp message" },
          { hook: "New listings this week", primary_text: `${first(intake.listings) ?? "See our latest listings"}${area ? ` in ${area}` : ""}. WhatsApp us to book a viewing.`, headline: "Book a viewing", cta: "Send WhatsApp message" },
          { hook: "Buying your first home?", primary_text: `We'll walk you through it, step by step${area ? `, across ${area}` : ""}. Message us on WhatsApp.`, headline: "Talk to an agent", cta: "Send WhatsApp message" },
        ]
      : [
          offer ? { hook: offer, primary_text: `${offer}. ${best ? `${best} and more on the lot. ` : ""}WhatsApp us for today's stock and prices.`, headline: "Drive today", cta: "Send WhatsApp message" } : null,
          best ? { hook: `${best} in stock`, primary_text: `${best} available now${area ? ` in ${area}` : ""}. WhatsApp us for photos, price and test drives.`, headline: "In stock now", cta: "Send WhatsApp message" } : null,
          { hook: "Fresh stock just landed", primary_text: `New units on the lot this week${area ? ` in ${area}` : ""}. Send us a WhatsApp and we'll send photos and prices.`, headline: "See what's new", cta: "Send WhatsApp message" },
          intake.financing_partners ? { hook: "Financing available", primary_text: `Ask us about financing with ${first(intake.financing_partners)}. WhatsApp us and we'll walk you through it.`, headline: "Ask about financing", cta: "Send WhatsApp message" } : null,
        ].filter(Boolean);
  return (out as { hook: string; primary_text: string; headline: string; cta: string }[]).slice(0, count);
}

export async function generateCopy(clientId: string, opts: { campaignPlanId?: string | null; count?: number; actorId: string | null; format?: "1:1" | "4:5" | "9:16" }) {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client) throw new Error("Client not found");
  if (!Object.keys(client.intake).length) throw new Error("Fill in the client's intake form first — ads may only use facts from it.");
  const [niche] = client.nicheId ? await db.select().from(schema.niches).where(eq(schema.niches.id, client.nicheId)) : [];
  const [plan] = opts.campaignPlanId ? await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, opts.campaignPlanId)) : [];
  const existing = await db.select({ hook: schema.creatives.hook }).from(schema.creatives).where(eq(schema.creatives.clientId, clientId)).orderBy(desc(schema.creatives.createdAt)).limit(30);
  const count = Math.min(10, Math.max(1, opts.count ?? 6));

  let ads: { hook: string; primary_text: string; headline: string; cta: string }[];
  let aiRunId: string | null = null;
  if (aiAvailable()) {
    const r = await runPrompt(
      creativeCopyV1,
      { niche: niche?.name ?? "local business", client: client.name, intake: client.intake, campaign: plan?.name ?? null, destination: plan ? (plan.template.includes("lead") ? "lead form" : "WhatsApp") : "WhatsApp", count, avoid: existing.map((e) => e.hook ?? "").filter(Boolean) },
      "creative_copy",
    );
    ads = r.output.ads;
    aiRunId = r.usageId;
  } else ads = templateCopy(client.intake, niche?.slug ?? null, count);

  const rows = ads.map((a) => {
    const honesty = checkHonesty({ hook: a.hook, primaryText: a.primary_text, headline: a.headline, cta: a.cta }, client.intake);
    return { clientId, campaignPlanId: plan?.id ?? null, format: opts.format ?? ("4:5" as const), hook: a.hook, primaryText: a.primary_text, headline: a.headline, cta: a.cta, honestyCheck: honesty, aiRunId, isDemo: client.isDemo, createdBy: opts.actorId };
  });
  const inserted = rows.length ? await db.insert(schema.creatives).values(rows).returning() : [];
  await logAudit({ actorType: aiRunId ? "ai" : "user", actorId: opts.actorId, action: "creatives.generated", entityTable: "clients", entityId: clientId, details: { count: inserted.length, ai: Boolean(aiRunId) } });
  return inserted;
}

export async function updateCopy(id: string, patch: { hook?: string; primaryText?: string; headline?: string; cta?: string; format?: "1:1" | "4:5" | "9:16"; mediaPath?: string | null }, actorId: string) {
  const [c] = await db.select().from(schema.creatives).where(eq(schema.creatives.id, id));
  if (!c) throw new Error("Creative not found");
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, c.clientId));
  const next = { ...c, ...patch };
  const honesty = checkHonesty({ hook: next.hook, primaryText: next.primaryText, headline: next.headline, cta: next.cta }, client!.intake);
  // Editing copy after approval sends it back for review.
  const status: Status = ["approved", "client_review", "live"].includes(c.status) && (patch.hook || patch.primaryText || patch.headline) ? "starred" : c.status;
  await db.update(schema.creatives).set({ ...patch, honestyCheck: honesty, honestyOverrideReason: honesty.ok ? null : c.honestyOverrideReason, status }).where(eq(schema.creatives.id, id));
  await logAudit({ actorType: "user", actorId, action: "creative.edited", entityTable: "creatives", entityId: id });
}

/** Status moves, with the honesty gate enforced server-side. */
export async function setCreativeStatus(id: string, to: Status, actor: { type: "user" | "portal"; id: string | null }, opts: { comment?: string } = {}) {
  const [c] = await db.select().from(schema.creatives).where(eq(schema.creatives.id, id));
  if (!c) throw new Error("Creative not found");
  const honesty = c.honestyCheck as HonestyResult | null;
  const gated = ["client_review", "approved", "live"].includes(to);
  if (gated && honesty && !honesty.ok && !c.honestyOverrideReason) {
    throw new Error(`Honesty check failed: ${honesty.mismatches.map((m) => m.claim).join(", ")} — fix the copy or override with a reason.`);
  }
  if (actor.type === "portal" && !(c.status === "client_review" && (to === "approved" || to === "rejected"))) throw new Error("This ad isn't waiting for your review.");
  await db.update(schema.creatives).set({ status: to, clientComment: opts.comment ?? c.clientComment }).where(eq(schema.creatives.id, id));
  await logAudit({ actorType: actor.type, actorId: actor.id, action: `creative.${to}`, entityTable: "creatives", entityId: id, details: opts.comment ? { comment: opts.comment } : {} });
  if (actor.type === "portal") {
    await db.insert(schema.activities).values({ clientId: c.clientId, type: "note", body: `Client ${to === "approved" ? "approved" : "asked for changes to"} the ad “${c.hook ?? c.headline ?? ""}”${opts.comment ? `: ${opts.comment}` : ""}` });
  }
}

export async function overrideHonesty(id: string, reason: string, actorId: string) {
  if (reason.trim().length < 10) throw new Error("Give a reason (at least a short sentence).");
  await db.update(schema.creatives).set({ honestyOverrideReason: reason.trim() }).where(eq(schema.creatives.id, id));
  await logAudit({ actorType: "user", actorId, action: "creative.honesty_override", entityTable: "creatives", entityId: id, details: { reason } });
}

export async function forReview(clientId: string) {
  return db.select().from(schema.creatives).where(and(eq(schema.creatives.clientId, clientId), inArray(schema.creatives.status, ["client_review"]))).orderBy(desc(schema.creatives.createdAt));
}
