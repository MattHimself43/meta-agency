"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireOwner, requireStaff } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { rotatePortalToken } from "@/lib/portal";
import { completeStep, reopenStep, saveIntake, type StepKey } from "@/lib/clients/onboarding";
import { generateCopy, overrideHonesty, setCreativeStatus, updateCopy } from "@/lib/creatives/service";
import { approvePlan, createPlan, launchPlan, markBuilt, pausePlan, requestBudgetChange, updatePlan } from "@/lib/campaigns/service";
import { audienceSchema, locationSchema, placementsSchema, planAdSchema, scheduleSchema } from "@/lib/campaigns/plan";
import { importPerformanceCsv } from "@/lib/performance/service";
import { generateReport, lastWeekStart, shareReport } from "@/lib/reports/service";
import { markInvoicePaid, markInvoiceSent, monthlyInvoiceRun } from "@/lib/billing/service";
import { astDateString } from "@/lib/time";

const uuid = z.string().uuid();
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
function done(path: string, params?: Record<string, string>): never {
  revalidatePath("/dashboard", "layout");
  redirect(params ? `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(params)}` : path);
}
/** Run a mutation; on error bounce back with ?error=, on success with the given params. */
async function attempt(back: string, fn: () => Promise<Record<string, string> | void>): Promise<never> {
  let ok: Record<string, string> | void;
  try {
    ok = await fn();
  } catch (e) {
    done(back, { error: err(e) });
  }
  done(back, ok ?? { notice: "saved" });
}

/* ------------------------------ Clients & onboarding ------------------------------ */

export async function rotatePortalAction(form: FormData) {
  const actor = await requireOwner();
  const id = uuid.parse(form.get("id"));
  const token = await rotatePortalToken(id, actor.userId);
  done(`/dashboard/clients/${id}`, { portal: token });
}

export async function ownerStepAction(form: FormData) {
  const actor = await requireOwner();
  const id = uuid.parse(form.get("id"));
  const step = z.enum(["agreement", "intake", "assets", "meta_access", "access_check", "spending_limit"]).parse(form.get("step")) as StepKey;
  const reopen = form.get("reopen") === "1";
  await attempt(`/dashboard/clients/${id}`, async () => {
    if (reopen) await reopenStep(id, step, actor.userId);
    else {
      const evidence = step === "access_check" ? { page: form.get("page") === "on", adAccount: form.get("adAccount") === "on", pixel: form.get("pixel") === "on", note: form.get("note") || null } : { confirmed: true, note: form.get("note") || null, by: actor.email };
      if (step === "access_check" && !(evidence as { page: boolean; adAccount: boolean }).page) throw new Error("Tick at least the Page and ad account once you've checked them in Business Manager.");
      if (step === "access_check" && !(evidence as { adAccount: boolean }).adAccount) throw new Error("Tick the ad account once you can see it in Business Manager.");
      await completeStep(id, step, evidence, { type: "user", id: actor.userId });
    }
    return { notice: "saved" };
  });
}

export async function staffIntakeAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const answers = Object.fromEntries([...form.entries()].filter(([k]) => k.startsWith("q:")).map(([k, v]) => [k.slice(2), String(v)]));
  await attempt(`/dashboard/clients/${id}?tab=onboarding`, async () => {
    const r = await saveIntake(id, answers, { type: "user", id: actor.userId }, { partial: true });
    return { notice: r.done ? "saved" : `Saved. Still missing: ${r.missing.join(", ")}` };
  });
}

const clientEdit = z.object({
  id: uuid,
  name: z.string().trim().min(1).max(200),
  contactName: z.string().trim().max(120).optional(),
  whatsapp: z.string().trim().max(30).optional(),
  email: z.string().trim().max(200).optional(),
  packageId: z.string().uuid().or(z.literal("")),
  status: z.enum(["onboarding", "active", "paused", "churned"]),
  startDate: z.string().optional(),
  contractEnd: z.string().optional(),
  monthlyBudget: z.coerce.number().min(0).max(100000),
  adAccountId: z.string().trim().max(40).optional(),
  pageUrl: z.string().trim().max(300).optional(),
  pixelId: z.string().trim().max(40).optional(),
  targetCpr: z.string().optional(),
});
export async function updateClientAction(form: FormData) {
  const actor = await requireStaff();
  const i = clientEdit.parse(Object.fromEntries(form));
  const target = i.targetCpr ? Math.round(Number(i.targetCpr) * 100) : null;
  const [before] = await db.select().from(schema.clients).where(eq(schema.clients.id, i.id));
  await db
    .update(schema.clients)
    .set({
      name: i.name,
      contactName: i.contactName || null,
      whatsapp: i.whatsapp || null,
      email: i.email || null,
      packageId: i.packageId || null,
      status: i.status,
      startDate: i.startDate || null,
      contractEnd: i.contractEnd || null,
      monthlyBudgetUsdCents: Math.round(i.monthlyBudget * 100),
      adAccountId: i.adAccountId || null,
      pageUrl: i.pageUrl || null,
      pixelId: i.pixelId || null,
      kpiTargets: { ...((before?.kpiTargets as object) ?? {}), cost_per_result_usd_cents: target && target > 0 ? target : undefined },
    })
    .where(eq(schema.clients.id, i.id));
  await logAudit({ actorType: "user", actorId: actor.userId, action: "client.updated", entityTable: "clients", entityId: i.id });
  done(`/dashboard/clients/${i.id}?tab=details`, { notice: "saved" });
}

/* ------------------------------ Creatives ------------------------------ */

export async function generateCopyAction(form: FormData) {
  const actor = await requireStaff();
  const clientId = uuid.parse(form.get("clientId"));
  const back = (form.get("back") as string) || "/dashboard/creative";
  await attempt(back, async () => {
    const made = await generateCopy(clientId, { actorId: actor.userId, count: z.coerce.number().int().min(1).max(10).parse(form.get("count") ?? 6), campaignPlanId: (form.get("campaignPlanId") as string) || null, format: z.enum(["1:1", "4:5", "9:16"]).parse(form.get("format") ?? "4:5") });
    return { notice: `${made.length} new draft(s). Check the honesty result on each before starring.` };
  });
}

export async function editCreativeAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const back = (form.get("back") as string) || "/dashboard/creative";
  await attempt(back, async () => {
    await updateCopy(id, { hook: String(form.get("hook") ?? ""), primaryText: String(form.get("primaryText") ?? ""), headline: String(form.get("headline") ?? ""), cta: String(form.get("cta") ?? ""), format: z.enum(["1:1", "4:5", "9:16"]).parse(form.get("format") ?? "4:5"), mediaPath: (form.get("mediaPath") as string) || null }, actor.userId);
  });
}

export async function creativeStatusAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const to = z.enum(["draft", "starred", "client_review", "approved", "rejected", "live", "fatigued"]).parse(form.get("to"));
  const back = (form.get("back") as string) || "/dashboard/creative";
  await attempt(back, async () => setCreativeStatus(id, to, { type: "user", id: actor.userId }));
}

export async function overrideHonestyAction(form: FormData) {
  const actor = await requireOwner();
  const id = uuid.parse(form.get("id"));
  const back = (form.get("back") as string) || "/dashboard/creative";
  await attempt(back, async () => overrideHonesty(id, String(form.get("reason") ?? ""), actor.userId));
}

/* ------------------------------ Campaigns ------------------------------ */

export async function createPlanAction(form: FormData) {
  const actor = await requireStaff();
  const clientId = uuid.parse(form.get("clientId"));
  let id = "";
  try {
    id = (await createPlan(clientId, z.string().min(1).parse(form.get("template")), actor.userId)).id;
  } catch (e) {
    done(`/dashboard/clients/${clientId}?tab=campaigns`, { error: err(e) });
  }
  done(`/dashboard/campaigns/${id}`);
}

export async function savePlanAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const json = (k: string) => JSON.parse(String(form.get(k) ?? "null"));
  await attempt(`/dashboard/campaigns/${id}`, async () => {
    const edit = {
      name: z.string().trim().min(1).max(160).parse(form.get("name")),
      objective: z.string().min(1).max(40).parse(form.get("objective")),
      audiences: z.array(audienceSchema).min(1).max(5).parse(json("audiences")),
      locations: z.array(locationSchema).min(1).max(20).parse(json("locations")),
      placements: placementsSchema.parse(json("placements")),
      schedule: scheduleSchema.parse(json("schedule")),
      ads: z.array(planAdSchema).max(20).parse(json("ads")),
      specialAdCategoryConfirmed: form.get("specialConfirmed") === "on",
      notes: (form.get("notes") as string)?.slice(0, 2000) || null,
    };
    const r = await updatePlan(id, edit, actor.userId);
    return { notice: r.special.category ? `Saved. Special ad category: ${r.special.category === "HOUSING" ? "Housing" : "Credit / financial"} — restricted targeting applied.` : "saved" };
  });
}

export async function planStatusAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const op = z.enum(["approve", "built", "launch", "pause"]).parse(form.get("op"));
  await attempt(`/dashboard/campaigns/${id}`, async () => {
    if (op === "approve") await approvePlan(id, actor);
    if (op === "built") await markBuilt(id, (form.get("metaCampaignId") as string) || null, actor);
    if (op === "launch") await launchPlan(id, actor);
    if (op === "pause") await pausePlan(id, actor);
    return { notice: { approve: "Plan approved — build it in Ads Manager with the checklist.", built: "Marked as built (paused).", launch: "Launched. Switch the campaign ON in Ads Manager now.", pause: "Paused. Switch it OFF in Ads Manager too." }[op] };
  });
}

export async function budgetAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  await attempt(`/dashboard/campaigns/${id}`, async () => {
    const cents = Math.round(z.coerce.number().min(1).max(10000).parse(form.get("budget")) * 100);
    const r = await requestBudgetChange(id, cents, { by: actor.role === "owner" ? "owner" : "account_manager", actorId: actor.userId, reason: (form.get("reason") as string) || undefined });
    return { notice: r.pending ? `Needs approval: ${(r.reasons ?? []).join("; ")}. It's in the approval queue.` : r.applied ? "Budget updated — change it in Ads Manager to match." : "No change." };
  });
}

/* ------------------------------ Performance & reports ------------------------------ */

export async function importCsvAction(form: FormData) {
  const actor = await requireStaff();
  const clientId = uuid.parse(form.get("clientId"));
  const file = form.get("file");
  await attempt(`/dashboard/clients/${clientId}?tab=performance`, async () => {
    if (!(file instanceof File) || !file.size) throw new Error("Choose the CSV you exported from Ads Manager.");
    if (file.size > 1_500_000) throw new Error("CSV too large — export a shorter date range.");
    const r = await importPerformanceCsv(clientId, await file.text(), actor.userId);
    return { notice: `Imported ${r.rows} row(s)${r.from ? ` (${r.from} → ${r.to})` : ""}${r.skipped ? `, skipped ${r.skipped}` : ""}.` };
  });
}

export async function generateReportAction(form: FormData) {
  await requireStaff();
  const clientId = uuid.parse(form.get("clientId"));
  const type = z.enum(["weekly", "monthly"]).parse(form.get("type"));
  let id = "";
  try {
    const today = astDateString();
    const start = type === "weekly" ? lastWeekStart(today) : `${today.slice(0, 7)}-01`;
    const period = (form.get("periodStart") as string) || start;
    id = (await generateReport(clientId, type, period)).report.id;
  } catch (e) {
    done(`/dashboard/clients/${clientId}?tab=reports`, { error: err(e) });
  }
  done(`/dashboard/reports/${id}`);
}

export async function shareReportAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const token = await shareReport(id, actor.userId);
  done(`/dashboard/reports/${id}`, { share: token });
}

export async function editReportAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const lines = (k: string) => String(form.get(k) ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const [r] = await db.select().from(schema.reports).where(eq(schema.reports.id, id));
  if (!r) throw new Error("Report not found");
  await db
    .update(schema.reports)
    .set({ content: { ...(r.content as object), headline: String(form.get("headline") ?? ""), whatHappened: lines("whatHappened"), whatWorked: lines("whatWorked"), whatChanges: lines("whatChanges"), upsell: (form.get("upsell") as string) || null, whatsappSummary: String(form.get("whatsappSummary") ?? "") }, status: "draft", shareTokenHash: null })
    .where(eq(schema.reports.id, id));
  await logAudit({ actorType: "user", actorId: actor.userId, action: "report.edited", entityTable: "reports", entityId: id });
  done(`/dashboard/reports/${id}`, { notice: "saved" });
}

/* ------------------------------ Billing ------------------------------ */

export async function invoiceAction(form: FormData) {
  const actor = await requireOwner();
  const id = uuid.parse(form.get("id"));
  const op = z.enum(["sent", "paid"]).parse(form.get("op"));
  await attempt(`/dashboard/billing/${id}`, async () => {
    if (op === "sent") await markInvoiceSent(id, actor.userId);
    else await markInvoicePaid(id, { method: z.enum(["bank_transfer", "cash", "other"]).parse(form.get("method") ?? "bank_transfer"), reference: (form.get("reference") as string) || null }, { type: "user", id: actor.userId });
  });
}

export async function runInvoicesNowAction() {
  await requireOwner();
  await attempt("/dashboard/billing", async () => {
    const r = await monthlyInvoiceRun();
    return { notice: `${r.created} new invoice draft(s) for ${r.period} in the approval queue${r.existing ? ` (${r.existing} already existed)` : ""}.` };
  });
}

const pkgSchema = z.object({ id: uuid, name: z.string().trim().min(1).max(60), setupFee: z.coerce.number().min(0).max(1_000_000), monthlyFee: z.coerce.number().min(0).max(1_000_000), includes: z.string().max(2000), recommendedSpend: z.string().max(120), terms: z.string().max(1000) });
export async function updatePackageAction(form: FormData) {
  const actor = await requireOwner();
  const i = pkgSchema.parse(Object.fromEntries(form));
  await db
    .update(schema.packages)
    .set({ name: i.name, setupFeeCents: Math.round(i.setupFee * 100), monthlyFeeCents: Math.round(i.monthlyFee * 100), includes: i.includes.split("\n").map((l) => l.trim()).filter(Boolean), recommendedSpend: i.recommendedSpend || null, terms: i.terms || null, recommended: form.get("recommended") === "on", active: form.get("active") === "on" })
    .where(eq(schema.packages.id, i.id));
  await logAudit({ actorType: "user", actorId: actor.userId, action: "package.updated", entityTable: "packages", entityId: i.id });
  done("/dashboard/billing?tab=packages", { notice: "saved" });
}
