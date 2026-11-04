import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { subDays } from "date-fns";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createApproval } from "@/lib/approvals";
import { getSettings } from "@/lib/settings";
import { AuthError, type Actor } from "@/lib/auth";
import { budgetChangeNeedsApproval, type Requester } from "./guardrails";
import { detectSpecialCategory, type SpecialCategory } from "./special-category";
import { buildChecklist, defaultPlan, type Audience, type CampaignTemplate, type Location, type PlanAd, type Placements, type Schedule } from "./plan";

export type Plan = typeof schema.campaignPlans.$inferSelect;

async function ctx(clientId: string) {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client) throw new Error("Client not found");
  const [niche] = client.nicheId ? await db.select().from(schema.niches).where(eq(schema.niches.id, client.nicheId)) : [];
  return { client, niche: niche ?? null, templates: ((niche?.campaignTemplates as CampaignTemplate[]) ?? []) as CampaignTemplate[] };
}

export async function createPlan(clientId: string, templateKey: string, actorId: string) {
  const { client, niche, templates } = await ctx(clientId);
  const t = templates.find((x) => x.key === templateKey);
  if (!t) throw new Error("Unknown campaign template");
  const days = 30;
  const daily = client.monthlyBudgetUsdCents ? Math.round(client.monthlyBudgetUsdCents / days) : 1500;
  const special = detectSpecialCategory({ templateCategory: t.specialAdCategory, nicheSlug: niche?.slug, texts: Object.values(client.intake) });
  const d = defaultPlan(t, { dailyUsdCents: daily, specialCategory: special.category });
  const [plan] = await db
    .insert(schema.campaignPlans)
    .values({ clientId, name: `${client.name.replace(/^Demo — /, "").replace(/ \(fictional\)$/, "")} — ${t.name}`, template: t.key, objective: d.objective, audiences: d.audiences, locations: d.locations, placements: d.placements, budgetType: d.budgetType, budgetUsdCents: d.budgetUsdCents, schedule: d.schedule, specialAdCategory: special.category, ads: [], isDemo: client.isDemo, createdBy: actorId })
    .returning();
  await logAudit({ actorType: "user", actorId, action: "campaign.plan_created", entityTable: "campaign_plans", entityId: plan!.id, details: { template: t.key } });
  return plan!;
}

export type PlanEdit = { name: string; objective: string; audiences: Audience[]; locations: Location[]; placements: Placements; schedule: Schedule; ads: PlanAd[]; specialAdCategoryConfirmed: boolean; notes: string | null };

/** Edits keep budget out on purpose — budgets only change through requestBudgetChange (guardrails). */
export async function updatePlan(id: string, edit: PlanEdit, actorId: string) {
  const [plan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, id));
  if (!plan) throw new Error("Plan not found");
  if (plan.status === "live") throw new Error("This campaign is live — pause it before editing the plan.");
  const { niche, templates } = await ctx(plan.clientId);
  const t = templates.find((x) => x.key === plan.template);
  const special = detectSpecialCategory({ templateCategory: t?.specialAdCategory, nicheSlug: niche?.slug, texts: edit.ads.flatMap((a) => [a.primaryText, a.headline]) });
  const restricted = special.category != null;
  const audiences = restricted ? edit.audiences.map((a) => ({ ...a, ageMin: 18, ageMax: 65, genders: "all" as const })) : edit.audiences;
  await db
    .update(schema.campaignPlans)
    .set({ ...edit, audiences, specialAdCategory: special.category, specialAdCategoryConfirmed: special.category ? edit.specialAdCategoryConfirmed : false, status: plan.status === "approved" || plan.status === "built_paused" ? "draft" : plan.status })
    .where(eq(schema.campaignPlans.id, id));
  await logAudit({ actorType: "user", actorId, action: "campaign.plan_edited", entityTable: "campaign_plans", entityId: id, details: { specialAdCategory: special.category } });
  return { special };
}

export async function checklistFor(plan: Plan) {
  const { client, templates } = await ctx(plan.clientId);
  return buildChecklist({
    plan: { name: plan.name, objective: plan.objective, budgetType: plan.budgetType, budgetUsdCents: plan.budgetUsdCents, audiences: plan.audiences as Audience[], locations: plan.locations as Location[], placements: plan.placements as Placements, schedule: plan.schedule as Schedule, specialAdCategory: plan.specialAdCategory as SpecialCategory, ads: plan.ads as PlanAd[] },
    template: templates.find((t) => t.key === plan.template) ?? null,
    client: { name: client.name, adAccountId: client.adAccountId, pageUrl: client.pageUrl, instagramHandle: client.instagramHandle, leadWhatsapp: client.intake.lead_whatsapp ?? client.whatsapp },
  });
}

/** Owner approves the plan (ready to build). */
export async function approvePlan(id: string, actor: Actor) {
  if (actor.role !== "owner") throw new AuthError("Only the owner can approve a campaign plan");
  const [plan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, id));
  if (!plan) throw new Error("Plan not found");
  if (!(plan.ads as PlanAd[]).length) throw new Error("Add at least one ad first.");
  if (plan.specialAdCategory && !plan.specialAdCategoryConfirmed) throw new Error("Confirm the special ad category against Meta's current policy first.");
  await db.update(schema.campaignPlans).set({ status: "approved" }).where(eq(schema.campaignPlans.id, id));
  await logAudit({ actorType: "user", actorId: actor.userId, action: "campaign.plan_approved", entityTable: "campaign_plans", entityId: id, approvedBy: actor.userId });
}

/** Manual mode: Matthias built it in Ads Manager, switched off. API mode uses lib/meta/build.buildPlanViaApi. */
export async function markBuilt(id: string, metaCampaignId: string | null, actor: Actor) {
  const [plan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, id));
  if (!plan) throw new Error("Plan not found");
  if (plan.status !== "approved") throw new Error("Approve the plan before building it.");
  await db.update(schema.campaignPlans).set({ status: "built_paused", metaCampaignId: metaCampaignId?.replace(/\D/g, "") || null }).where(eq(schema.campaignPlans.id, id));
  await logAudit({ actorType: "user", actorId: actor.userId, action: "campaign.built_paused", entityTable: "campaign_plans", entityId: id, details: { metaCampaignId } });
}

/**
 * Launch is a separate, owner-only button, and it needs the "spending limit set" onboarding step done.
 * Nothing on the AI/routine path can reach this function (it requires a signed-in owner Actor).
 */
export async function launchPlan(id: string, actor: Actor) {
  if (actor.role !== "owner") throw new AuthError("Only the owner can launch a campaign");
  const [plan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, id));
  if (!plan) throw new Error("Plan not found");
  if (plan.status !== "built_paused" && plan.status !== "paused") throw new Error("Build the campaign (paused) before launching.");
  const [limit] = await db.select().from(schema.onboardingSteps).where(and(eq(schema.onboardingSteps.clientId, plan.clientId), eq(schema.onboardingSteps.stepKey, "spending_limit")));
  if (!limit || limit.status !== "done") throw new Error("Confirm the client's account spending limit (onboarding step) before launching.");
  // API mode: flip the PAUSED objects to ACTIVE with a one-time grant that only an owner Actor can obtain.
  const { metaMode } = await import("@/lib/meta/client");
  if ((plan.metaIds as { campaignId?: string })?.campaignId && (await metaMode()) === "api") {
    const { issueLaunchGrant, spendGrant } = await import("@/lib/meta/guard");
    const { activateViaApi } = await import("@/lib/meta/build");
    const grant = issueLaunchGrant(actor, id);
    try {
      await activateViaApi(id, grant);
    } finally {
      spendGrant(grant);
    }
  }
  await db.update(schema.campaignPlans).set({ status: "live", launchedAt: new Date(), launchedBy: actor.userId }).where(eq(schema.campaignPlans.id, id));
  await db.insert(schema.activities).values({ clientId: plan.clientId, type: "note", body: `Campaign launched: ${plan.name}` });
  await logAudit({ actorType: "user", actorId: actor.userId, action: "campaign.launched", entityTable: "campaign_plans", entityId: id, approvedBy: actor.userId });
}

export async function pausePlan(id: string, actor: Actor) {
  const { metaMode } = await import("@/lib/meta/client");
  if ((await metaMode()) === "api") {
    const { pauseViaApi } = await import("@/lib/meta/build");
    await pauseViaApi(id, actor.role === "owner" ? "owner" : "staff");
  }
  await db.update(schema.campaignPlans).set({ status: "paused" }).where(eq(schema.campaignPlans.id, id));
  await logAudit({ actorType: "user", actorId: actor.userId, action: "campaign.paused", entityTable: "campaign_plans", entityId: id });
}

/** Every budget change goes through here; the guardrail decides whether it applies now or waits for approval. */
export async function requestBudgetChange(id: string, newCents: number, requester: { by: Requester; actorId: string | null; reason?: string }) {
  if (!Number.isInteger(newCents) || newCents < 100 || newCents > 10_000_00) throw new Error("Budget must be between US$1 and US$10,000 a day.");
  const [plan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, id));
  if (!plan) throw new Error("Plan not found");
  if (newCents === plan.budgetUsdCents) return { applied: false, pending: false };
  const settings = await getSettings();
  const recent = await db
    .select({ old: schema.budgetChanges.oldBudgetUsdCents, applied: schema.budgetChanges.appliedAt })
    .from(schema.budgetChanges)
    .where(and(eq(schema.budgetChanges.campaignPlanId, id), eq(schema.budgetChanges.status, "applied"), gte(schema.budgetChanges.appliedAt, subDays(new Date(), 7))));
  const check = budgetChangeNeedsApproval({ currentCents: plan.budgetUsdCents, newCents, recentBudgetsCents: recent.map((r) => r.old), ownerLimitCents: settings.budgetChangeLimitCents, requestedBy: requester.by });
  const [change] = await db
    .insert(schema.budgetChanges)
    .values({ campaignPlanId: id, oldBudgetUsdCents: plan.budgetUsdCents, newBudgetUsdCents: newCents, reason: requester.reason ?? check.reasons.join("; "), requestedBy: requester.by, status: "pending", isDemo: plan.isDemo, createdBy: requester.actorId })
    .returning();
  if (check.needsApproval) {
    const { approval } = await createApproval({
      itemType: "budget_change",
      title: `Budget change — ${plan.name}`,
      summary: `US$${(plan.budgetUsdCents / 100).toFixed(2)} → US$${(newCents / 100).toFixed(2)} a day`,
      preview: { body: [requester.reason, ...check.reasons].filter(Boolean).join("\n"), planId: id },
      subjectTable: "budget_changes",
      subjectId: change!.id,
      requestedBy: requester.by === "owner" ? `user:${requester.actorId}` : requester.by,
      isDemo: plan.isDemo,
    });
    await db.update(schema.budgetChanges).set({ approvalId: approval.id }).where(eq(schema.budgetChanges.id, change!.id));
    return { applied: false, pending: true, reasons: check.reasons };
  }
  await applyBudgetChange(change!.id, requester.actorId);
  return { applied: true, pending: false };
}

export async function applyBudgetChange(changeId: string, actorId: string | null, tx: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0] = db) {
  const [c] = await tx.select().from(schema.budgetChanges).where(eq(schema.budgetChanges.id, changeId));
  if (!c || c.status !== "pending") return;
  // API mode: push to Meta first, so a Meta error leaves the change pending instead of out of sync.
  const [plan] = await tx.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, c.campaignPlanId));
  const { metaMode } = await import("@/lib/meta/client");
  let pushed = false;
  if (plan && (plan.metaIds as { adSetIds?: string[] })?.adSetIds?.length && (await metaMode()) === "api") {
    const { pushBudgetViaApi } = await import("@/lib/meta/build");
    pushed = await pushBudgetViaApi(plan.id, c.id, c.newBudgetUsdCents, plan.budgetType);
  }
  await tx.update(schema.campaignPlans).set({ budgetUsdCents: c.newBudgetUsdCents }).where(eq(schema.campaignPlans.id, c.campaignPlanId));
  await tx.update(schema.budgetChanges).set({ status: "applied", appliedAt: new Date() }).where(eq(schema.budgetChanges.id, changeId));
  await logAudit({ actorType: actorId ? "user" : "system", actorId, action: "campaign.budget_changed", entityTable: "campaign_plans", entityId: c.campaignPlanId, details: { from: c.oldBudgetUsdCents, to: c.newBudgetUsdCents, note: pushed ? "Pushed to Meta (API mode)" : "Update the budget in Ads Manager to match (Manual mode)" } }, tx as never);
}

export async function plansFor(clientId: string) {
  return db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.clientId, clientId)).orderBy(desc(schema.campaignPlans.createdAt));
}
