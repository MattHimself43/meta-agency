import "server-only";
import React from "react";
import { and, asc, eq } from "drizzle-orm";
import { renderToBuffer } from "@react-pdf/renderer";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { createApproval } from "@/lib/approvals";
import { getSettings } from "@/lib/settings";
import { draftInvoice } from "@/lib/billing/invoices";
import { putObject } from "@/lib/storage";
import { formatAst } from "@/lib/time";
import { aiAvailable, runPrompt } from "@/lib/ai/client";
import { kickoffV1, type KickoffOutput } from "@/lib/ai/prompts/deliver.v1";
import { AgreementPdf } from "@/lib/pdf/agreement-pdf";
import { agreementSections, AGREEMENT_VERSION } from "./agreement";

export type Client = typeof schema.clients.$inferSelect;
export type IntakeField = { key: string; label: string; type: "text" | "textarea" | "file_or_url" | "phone" | "select"; required: boolean; hint?: string; options?: string[] };
export type StepKey = "agreement" | "intake" | "assets" | "meta_access" | "access_check" | "spending_limit";

export async function steps(clientId: string) {
  return db.select().from(schema.onboardingSteps).where(eq(schema.onboardingSteps.clientId, clientId)).orderBy(asc(schema.onboardingSteps.sortOrder));
}

export async function clientContext(clientId: string) {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client) throw new Error("Client not found");
  const [pkg] = client.packageId ? await db.select().from(schema.packages).where(eq(schema.packages.id, client.packageId)) : [];
  const [niche] = client.nicheId ? await db.select().from(schema.niches).where(eq(schema.niches.id, client.nicheId)) : [];
  return { client, pkg: pkg ?? null, niche: niche ?? null, intakeSchema: ((niche?.intakeSchema as IntakeField[]) ?? []) as IntakeField[] };
}

/** Mark a step done (idempotent) and, when everything is done, activate the client and draft the kickoff plan. */
export async function completeStep(clientId: string, key: StepKey, evidence: Record<string, unknown>, actor: { type: "user" | "portal"; id: string | null }) {
  await db
    .update(schema.onboardingSteps)
    .set({ status: "done", completedAt: new Date(), evidence })
    .where(and(eq(schema.onboardingSteps.clientId, clientId), eq(schema.onboardingSteps.stepKey, key)));
  await db.insert(schema.activities).values({ clientId, type: "note", body: `Onboarding: ${key.replace("_", " ")} done${actor.type === "portal" ? " (by the client in the portal)" : ""}` });
  await logAudit({ actorType: actor.type, actorId: actor.id, action: "onboarding.step_done", entityTable: "clients", entityId: clientId, details: { step: key } });
  return maybeFinishOnboarding(clientId);
}

export async function reopenStep(clientId: string, key: StepKey, actorId: string) {
  await db.update(schema.onboardingSteps).set({ status: "pending", completedAt: null }).where(and(eq(schema.onboardingSteps.clientId, clientId), eq(schema.onboardingSteps.stepKey, key)));
  await logAudit({ actorType: "user", actorId, action: "onboarding.step_reopened", entityTable: "clients", entityId: clientId, details: { step: key } });
}

async function maybeFinishOnboarding(clientId: string) {
  const all = await steps(clientId);
  if (!all.length || all.some((s) => s.status !== "done")) return { finished: false };
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (client!.status === "onboarding") {
    await db.update(schema.clients).set({ status: "active", startDate: client!.startDate ?? new Date().toISOString().slice(0, 10) }).where(eq(schema.clients.id, clientId));
    await db.insert(schema.activities).values({ clientId, type: "stage_change", body: "Onboarding complete → Active" });
  }
  await draftKickoffPlan(clientId);
  return { finished: true };
}

/* ------------------------------ Agreement ------------------------------ */

export async function agreementFor(clientId: string) {
  const { client, pkg } = await clientContext(clientId);
  const settings = await getSettings();
  return agreementSections({
    agencyName: settings.agencyName,
    agencyAddress: settings.addressLines,
    registrationNumber: settings.registrationNumber,
    clientName: client.name,
    contactName: client.contactName,
    packageName: pkg?.name ?? "agreed",
    setupFeeTtd: (pkg?.setupFeeCents ?? 0) / 100,
    setupWaived: client.setupFeeWaived,
    monthlyFeeTtd: (pkg?.monthlyFeeCents ?? 0) / 100,
    includes: pkg?.includes ?? [],
    recommendedSpend: pkg?.recommendedSpend ?? null,
    dueDays: settings.invoiceDueDays,
    vatEnabled: settings.vatEnabled,
    vatRatePct: settings.vatRateBps / 100,
  });
}

const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** E-signature: typed name + drawn signature, timestamp and IP stored, signed PDF saved. */
export async function signAgreement(clientId: string, input: { name: string; signaturePng: string; ip: string | null; userAgent: string | null }) {
  const name = input.name.trim();
  if (name.length < 3) throw new Error("Type your full name to sign.");
  if (!PNG_DATA_URL.test(input.signaturePng) || input.signaturePng.length < 1500) throw new Error("Please draw your signature in the box.");
  if (input.signaturePng.length > 600_000) throw new Error("Signature image is too large.");

  const { client, pkg } = await clientContext(clientId);
  const settings = await getSettings();
  const signedAt = new Date();
  const sections = await agreementFor(clientId);
  const sigPath = `clients/${clientId}/agreement/signature-${signedAt.getTime()}.png`;
  await putObject(sigPath, Buffer.from(input.signaturePng.split(",")[1]!, "base64"), "image/png");
  const pdf = await renderToBuffer(
    React.createElement(AgreementPdf, {
      agencyName: settings.agencyName,
      clientName: client.name,
      version: AGREEMENT_VERSION,
      sections,
      signature: { name, imageDataUrl: input.signaturePng, signedAt: formatAst(signedAt, "d MMMM yyyy, h:mm a"), ip: input.ip },
    }) as Parameters<typeof renderToBuffer>[0],
  );
  const pdfPath = `clients/${clientId}/agreement/agreement-${AGREEMENT_VERSION}-signed-${signedAt.getTime()}.pdf`;
  await putObject(pdfPath, new Uint8Array(pdf), "application/pdf");

  const [agreement] = await db
    .insert(schema.agreements)
    .values({ clientId, version: AGREEMENT_VERSION, signedPdfPath: pdfPath, signatureName: name, signatureImagePath: sigPath, signedAt, signedIp: input.ip && /^[0-9a-f.:]+$/i.test(input.ip) ? input.ip : null, signedUserAgent: input.userAgent?.slice(0, 300) ?? null, isDemo: client.isDemo })
    .returning();
  // Setup-fee invoice draft (no-op if it was already drafted when the lead was won).
  if (pkg && !client.setupFeeWaived && pkg.setupFeeCents > 0) {
    await db.transaction((tx) => draftInvoice(tx, { clientId, kind: "setup", periodKey: "setup", clientName: client.name, lines: [{ description: `${pkg.name} package — one-time setup`, unitCents: pkg.setupFeeCents }], requestedBy: "portal", isDemo: client.isDemo }));
  }
  await completeStep(clientId, "agreement", { agreementId: agreement!.id, signatureName: name, signedAt: signedAt.toISOString(), ip: input.ip }, { type: "portal", id: null });
  return agreement!;
}

/* ------------------------------ Intake ------------------------------ */

export function validateIntake(fields: IntakeField[], answers: Record<string, string>) {
  const clean: Record<string, string> = {};
  const missing: string[] = [];
  for (const f of fields) {
    const v = (answers[f.key] ?? "").trim().slice(0, 4000);
    if (f.type === "select" && v && f.options && !f.options.includes(v)) {
      missing.push(f.label);
      continue;
    }
    if (v) clean[f.key] = v;
    else if (f.required) missing.push(f.label);
  }
  return { clean, missing };
}

export async function saveIntake(clientId: string, answers: Record<string, string>, actor: { type: "user" | "portal"; id: string | null }, opts: { partial?: boolean } = {}) {
  const { client, intakeSchema } = await clientContext(clientId);
  const { clean, missing } = validateIntake(intakeSchema, answers);
  const merged = { ...client.intake, ...clean };
  await db.update(schema.clients).set({ intake: merged }).where(eq(schema.clients.id, clientId));
  if (missing.length && !opts.partial) return { done: false, missing };
  if (!missing.length) await completeStep(clientId, "intake", { fields: Object.keys(clean) }, actor);
  return { done: !missing.length, missing };
}

/* ------------------------------ Assets & brand ------------------------------ */

export async function saveBrand(clientId: string, colours: string[], actor: { type: "user" | "portal"; id: string | null }, finish: boolean) {
  const valid = colours.map((c) => c.trim()).filter((c) => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 6);
  await db.update(schema.clients).set({ brandColours: valid }).where(eq(schema.clients.id, clientId));
  if (finish) {
    const count = await db.select({ id: schema.assets.id }).from(schema.assets).where(eq(schema.assets.clientId, clientId));
    if (!count.length) throw new Error("Upload at least one photo or your logo first.");
    await completeStep(clientId, "assets", { assets: count.length, colours: valid }, actor);
  }
}

/* ------------------------------ Meta access ------------------------------ */

export function normalizeAdAccount(v: string): string | null {
  const digits = v.replace(/^act_/i, "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 20 ? `act_${digits}` : null;
}

export async function saveMetaAccess(clientId: string, input: { adAccountId: string; pageUrl: string; instagram?: string; businessId?: string; partnerAccessGiven: boolean; cardAdded: boolean }, actor: { type: "user" | "portal"; id: string | null }) {
  const act = normalizeAdAccount(input.adAccountId);
  if (!act) throw new Error("That doesn't look like an ad account ID (it's a long number, sometimes shown as act_123…).");
  if (!/facebook\.com\//i.test(input.pageUrl)) throw new Error("Paste your Facebook Page link (it starts with facebook.com/).");
  if (!input.partnerAccessGiven || !input.cardAdded) throw new Error("Tick both boxes once you've given partner access and added your card.");
  await db
    .update(schema.clients)
    .set({ adAccountId: act, pageUrl: input.pageUrl.trim(), instagramHandle: input.instagram?.trim().replace(/^@/, "") || null, metaBusinessId: input.businessId?.replace(/\D/g, "") || null })
    .where(eq(schema.clients.id, clientId));
  await completeStep(clientId, "meta_access", { adAccountId: act, pageUrl: input.pageUrl }, actor);
}

/* ------------------------------ Kickoff plan ------------------------------ */

function templatePlan(ctx: Awaited<ReturnType<typeof clientContext>>): KickoffOutput {
  const i = ctx.client.intake;
  const templates = (ctx.niche?.campaignTemplates as { key: string; name: string }[] | undefined) ?? [];
  const main = templates[0]?.name ?? "Click-to-WhatsApp";
  return {
    goals: ["Steady WhatsApp enquiries from serious buyers", "Find the cost per chat that works for this business"],
    offer: i.deposit_offers || i.best_sellers || i.listings || "[Agree the lead offer with the client]",
    audiences: ["Trinidad & Tobago broad, 25–65", "People who engaged with the Page/Instagram in the last 60 days"],
    budget_split: [
      { campaign: main, share_pct: 80, why: "Main lead driver" },
      { campaign: templates.find((t) => /retarget/i.test(t.key))?.name ?? "Retargeting", share_pct: 20, why: "Bring back people who already engaged" },
    ],
    first_creative_ideas: [i.best_sellers ? { hook: `${i.best_sellers.split(/[,;\n]/)[0]} in stock now`, visual: "Best-selling unit, clean photo" } : { hook: "[Hook from best sellers]", visual: "[Best unit]" }, { hook: "WhatsApp us for today's price", visual: "Lot / team photo" }],
    first_week: ["Build the campaign in Ads Manager (paused)", "Client approves the first ads in the portal", "Launch once the spending limit is confirmed", "First weekly report on Monday"],
    missing_facts: aiAvailable() ? [] : ["AI not configured — template plan, edit before approving"],
  };
}

function planText(p: KickoffOutput) {
  return [
    `Goals: ${p.goals.join("; ")}`,
    `Offer: ${p.offer}`,
    `Audiences: ${p.audiences.join("; ")}`,
    `Budget: ${p.budget_split.map((b) => `${b.campaign} ${b.share_pct}%`).join(", ")}`,
    `First ads: ${p.first_creative_ideas.map((c) => `“${c.hook}”`).join(", ")}`,
    `Week one: ${p.first_week.join(" → ")}`,
  ].join("\n");
}

export async function draftKickoffPlan(clientId: string) {
  const ctx = await clientContext(clientId);
  let plan: KickoffOutput;
  let source = "template";
  if (aiAvailable()) {
    const r = await runPrompt(
      kickoffV1,
      {
        niche: ctx.niche?.name ?? "local business",
        client: { name: ctx.client.name, package: ctx.pkg?.name ?? "", includes: ctx.pkg?.includes ?? [], monthly_budget_usd: ctx.client.monthlyBudgetUsdCents ? ctx.client.monthlyBudgetUsdCents / 100 : null, kpi_targets: ctx.niche?.kpiTargets },
        intake: ctx.client.intake,
        campaign_templates: (ctx.niche?.campaignTemplates as { key: string; name: string }[]) ?? [],
      },
      "kickoff_plan",
    );
    plan = r.output;
    source = "ai";
  } else plan = templatePlan(ctx);
  await createApproval({
    itemType: "kickoff_plan",
    title: `First-month plan — ${ctx.client.name}`,
    summary: `Onboarding complete. ${source === "ai" ? "Drafted by Claude" : "Template plan"} — edit, then approve.`,
    preview: { body: planText(plan), plan, clientId, missing_facts: plan.missing_facts },
    subjectTable: "clients",
    subjectId: clientId,
    requestedBy: source === "ai" ? "ai" : "system",
    dedupeKey: `kickoff:${clientId}`,
    isDemo: ctx.client.isDemo,
  });
}
