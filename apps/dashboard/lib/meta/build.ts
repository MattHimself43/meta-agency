import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { readBytes } from "@/lib/storage";
import type { Actor } from "@/lib/auth";
import type { Audience, CampaignTemplate, Location, Placements, PlanAd, Schedule } from "@/lib/campaigns/plan";
import { actId, metaGet, metaPost } from "./client";
import { planToMetaSpecs } from "./specs";
import type { LaunchGrant, MetaCallContext } from "./guard";

export type MetaIds = {
  campaignId?: string;
  adSetIds?: string[];
  creativeIds?: string[];
  adIds?: string[];
  leadFormId?: string;
  builtAt?: string;
  apiVersion?: string;
  warnings?: string[];
  lastError?: string;
  attempt?: number;
};

async function planContext(planId: string) {
  const [plan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, planId));
  if (!plan) throw new Error("Plan not found");
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, plan.clientId));
  if (!client) throw new Error("Client not found");
  const [niche] = client.nicheId ? await db.select().from(schema.niches).where(eq(schema.niches.id, client.nicheId)) : [];
  const template = ((niche?.campaignTemplates as CampaignTemplate[] | undefined) ?? []).find((t) => t.key === plan.template) ?? null;
  return { plan, client, template };
}

/** Upload each ad's image to the ad account once; returns creativeId → image hash. */
async function uploadImages(act: string, ads: PlanAd[]) {
  const ids = [...new Set(ads.map((a) => a.creativeId).filter(Boolean))] as string[];
  if (!ids.length) return {};
  const creatives = await db.select().from(schema.creatives).where(inArray(schema.creatives.id, ids));
  const out: Record<string, string> = {};
  for (const c of creatives) {
    if (!c.mediaPath) continue;
    const bytes = await readBytes(c.mediaPath);
    if (!bytes) continue;
    const res = await metaPost<{ images?: Record<string, { hash: string }> }>(`/${act}/adimages`, { bytes: bytes.toString("base64") }, { origin: "staff" });
    const hash = Object.values(res.images ?? {})[0]?.hash;
    if (hash) out[c.id] = hash;
  }
  return out;
}

/** Look up Meta interest IDs by name (Targeting Search). */
async function interestIds(audiences: Audience[]) {
  const names = [...new Set(audiences.flatMap((a) => a.interests))];
  const out: Record<string, string> = {};
  for (const n of names) {
    const r = await metaGet<{ data?: { id: string; name: string }[] }>("/search", { type: "adinterest", q: n, limit: 1 });
    const hit = r.data?.[0];
    if (hit) out[n] = hit.id;
  }
  return out;
}

/**
 * API mode "Build": creates campaign → ad sets → creatives → ads in the client's ad account, all PAUSED.
 * Idempotency keys make a retry after a failure pick up where it stopped instead of duplicating objects.
 */
export async function buildPlanViaApi(planId: string, actor: Actor) {
  const { plan, client, template } = await planContext(planId);
  if (plan.status !== "approved") throw new Error("Approve the plan before building it.");
  if (!client.pageId) throw new Error("Run the access check for this client first (it finds the Page ID).");
  const act = actId(client.adAccountId);
  const ids = (plan.metaIds ?? {}) as MetaIds;
  const attempt = (ids.attempt ?? 0) + 1;
  const ctx: MetaCallContext = { origin: actor.role === "owner" ? "owner" : "staff", planId };
  const key = (stage: string) => `agencyos:${planId}:${stage}:${attempt}`;

  const save = (patch: MetaIds) => db.update(schema.campaignPlans).set({ metaIds: { ...ids, ...patch, attempt } }).where(eq(schema.campaignPlans.id, planId));
  try {
    const ads = plan.ads as PlanAd[];
    const specs = planToMetaSpecs({
      plan: { id: plan.id, name: plan.name, objective: plan.objective, template: plan.template, budgetType: plan.budgetType as "daily" | "lifetime", budgetUsdCents: plan.budgetUsdCents, audiences: plan.audiences as Audience[], locations: plan.locations as Location[], placements: plan.placements as Placements, schedule: plan.schedule as Schedule, specialAdCategory: plan.specialAdCategory, ads },
      template,
      pageId: client.pageId,
      instagramUserId: null,
      leadFormId: ids.leadFormId ?? null,
      imageHashes: await uploadImages(act, ads),
      interestIds: await interestIds(plan.audiences as Audience[]),
    });

    const campaign = await metaPost<{ id: string }>(`/${act}/campaigns`, specs.campaign, ctx, key("campaign"));
    await save({ campaignId: campaign.id });
    const adSetIds: string[] = [];
    for (const [n, a] of specs.adSets.entries()) adSetIds.push((await metaPost<{ id: string }>(`/${act}/adsets`, { ...a, campaign_id: campaign.id }, ctx, key(`adset:${n}`))).id);
    await save({ campaignId: campaign.id, adSetIds });
    const creativeIds: string[] = [];
    for (const [n, c] of specs.creatives.entries()) creativeIds.push((await metaPost<{ id: string }>(`/${act}/adcreatives`, c, ctx, key(`creative:${n}`))).id);
    const adIds: string[] = [];
    for (const [s, adSetId] of adSetIds.entries())
      for (const ad of specs.ads)
        adIds.push((await metaPost<{ id: string }>(`/${act}/ads`, { name: ad.name, adset_id: adSetId, creative: { creative_id: creativeIds[ad.creativeIndex] }, status: "PAUSED" }, ctx, key(`ad:${s}:${ad.creativeIndex}`))).id);

    const meta: MetaIds = { ...ids, campaignId: campaign.id, adSetIds, creativeIds, adIds, builtAt: new Date().toISOString(), apiVersion: process.env.META_API_VERSION || "v26.0", warnings: specs.warnings, lastError: undefined, attempt };
    await db.update(schema.campaignPlans).set({ status: "built_paused", metaCampaignId: campaign.id, metaIds: meta }).where(eq(schema.campaignPlans.id, planId));
    await logAudit({ actorType: "user", actorId: actor.userId, action: "campaign.built_paused_api", entityTable: "campaign_plans", entityId: planId, details: { campaignId: campaign.id, adSets: adSetIds.length, ads: adIds.length } });
    return meta;
  } catch (e) {
    await save({ lastError: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}

/** Owner launch in API mode: flips campaign, ad sets and ads to ACTIVE using the one-time grant. */
export async function activateViaApi(planId: string, grant: LaunchGrant) {
  const [plan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, planId));
  const ids = (plan?.metaIds ?? {}) as MetaIds;
  if (!ids.campaignId) throw new Error("This plan wasn't built through the API.");
  const ctx: MetaCallContext = { origin: "owner", planId, grant };
  for (const id of ids.adIds ?? []) await metaPost(`/${id}`, { status: "ACTIVE" }, ctx);
  for (const id of ids.adSetIds ?? []) await metaPost(`/${id}`, { status: "ACTIVE" }, ctx);
  await metaPost(`/${ids.campaignId}`, { status: "ACTIVE" }, ctx);
}

/** Pausing is always allowed (it can only stop spend). */
export async function pauseViaApi(planId: string, origin: MetaCallContext["origin"]) {
  const [plan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, planId));
  const ids = (plan?.metaIds ?? {}) as MetaIds;
  if (!ids.campaignId) return false;
  await metaPost(`/${ids.campaignId}`, { status: "PAUSED" }, { origin, planId });
  return true;
}

/** Push an applied budget change to the plan's ad sets (split evenly, as built). */
export async function pushBudgetViaApi(planId: string, changeId: string, newCents: number, budgetType: string) {
  const [plan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, planId));
  const ids = (plan?.metaIds ?? {}) as MetaIds;
  if (!ids.adSetIds?.length) return false;
  const share = Math.floor(newCents / ids.adSetIds.length);
  for (const id of ids.adSetIds) await metaPost(`/${id}`, budgetType === "lifetime" ? { lifetime_budget: share } : { daily_budget: share }, { origin: "routine", planId, budgetChangeId: changeId });
  return true;
}
