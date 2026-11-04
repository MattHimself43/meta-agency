"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireOwner, requireStaff } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { disconnect, markChecked, saveSecret, updateConfig, type Provider } from "@/lib/integrations/store";

const uuid = z.string().uuid();
const err = (e: unknown) => (e instanceof Error ? e.message : String(e));
function done(path: string, params?: Record<string, string>): never {
  revalidatePath("/dashboard", "layout");
  redirect(params ? `${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(params)}` : path);
}
type Outcome = { ok: string } | { error: string } | { notice: string } | void;
async function attempt(back: string, fn: () => Promise<Outcome>): Promise<never> {
  let ok: Outcome;
  try {
    ok = await fn();
  } catch (e) {
    done(back, { error: err(e) });
  }
  // Pages show ?notice= (success) and ?error=.
  if (ok && "ok" in ok) done(back, { notice: ok.ok });
  done(back, (ok as Record<string, string> | undefined) ?? { notice: "saved" });
}
const BACK = "/dashboard/integrations";

/* ---------------------------------------------------------------- Integrations page */

export async function saveMetaTokenAction(form: FormData) {
  const actor = await requireOwner();
  const token = String(form.get("token") ?? "").trim();
  await attempt(BACK, async () => {
    if (token.length < 50 || /\s/.test(token)) throw new Error("That doesn't look like a System User access token.");
    await saveSecret("meta", token, { label: "System User token", actorId: actor.userId, status: "connected" });
    const { testMetaToken } = await import("@/lib/meta/service");
    try {
      const r = await testMetaToken();
      await markChecked("meta", true, null, { label: r.label });
      return { ok: `Meta token saved — ${r.label}` };
    } catch (e) {
      await markChecked("meta", false, err(e));
      return { error: `Token saved but the test failed: ${err(e)}` };
    }
  });
}

export async function saveHiggsfieldAction(form: FormData) {
  const actor = await requireOwner();
  await attempt(BACK, async () => {
    const key = String(form.get("key") ?? "").trim();
    if (key) {
      if (!/^[^:\s]+:[^:\s]+$/.test(key)) throw new Error("Paste the key as KEY_ID:KEY_SECRET.");
      await saveSecret("higgsfield", key, { label: "API key", actorId: actor.userId });
    }
    const extraRaw = String(form.get("extraParams") ?? "").trim();
    let extraParams: Record<string, unknown> = {};
    if (extraRaw) {
      try {
        extraParams = z.record(z.string(), z.unknown()).parse(JSON.parse(extraRaw));
      } catch {
        throw new Error("Extra parameters must be a JSON object, e.g. {\"resolution\":\"720p\"}.");
      }
    }
    const model = (v: FormDataEntryValue | null) => String(v ?? "").trim().replace(/^https?:\/\/[^/]+\//, "").replace(/^\//, "");
    await updateConfig("higgsfield", { imageModel: model(form.get("imageModel")) || null, videoModel: model(form.get("videoModel")) || null, extraParams }, actor.userId);
    return { ok: "Higgsfield settings saved" };
  });
}

export async function saveWipayAction(form: FormData) {
  const actor = await requireOwner();
  await attempt(BACK, async () => {
    const feeStructure = z.enum(["customer_pay", "merchant_absorb", "split"]).parse(form.get("feeStructure"));
    await updateConfig("wipay", { feeStructure }, actor.userId);
    return { ok: "WiPay settings saved" };
  });
}

export async function testIntegrationAction(form: FormData) {
  await requireOwner();
  const provider = z.enum(["meta", "google", "higgsfield", "wipay", "anthropic", "resend"]).parse(form.get("provider")) as Provider;
  await attempt(BACK, async () => {
    try {
      const label = await runTest(provider);
      await markChecked(provider, true, null, { label });
      return { ok: `${provider}: ${label}` };
    } catch (e) {
      await markChecked(provider, false, err(e));
      throw e;
    }
  });
}

async function runTest(provider: Provider): Promise<string> {
  switch (provider) {
    case "meta":
      return (await (await import("@/lib/meta/service")).testMetaToken()).label;
    case "google":
      return (await (await import("@/lib/google")).testGoogle()).label;
    case "higgsfield":
      return (await (await import("@/lib/creatives/generator")).testHiggsfield()).label;
    case "wipay": {
      const { wipayConfig } = await import("@/lib/payments/wipay-core");
      const cfg = wipayConfig(process.env);
      // The request endpoint needs no auth, so a test just proves the host answers; no checkout is created.
      const res = await fetch(`${cfg.baseUrl}/plugins/payments/request`, { method: "GET", signal: AbortSignal.timeout(15_000) }).catch((e) => {
        throw new Error(`WiPay (${cfg.environment}) couldn't be reached: ${err(e)}`);
      });
      return `${cfg.environment} · account ${cfg.accountNumber.replace(/.(?=.{4})/g, "•")} · host answered HTTP ${res.status}`;
    }
    case "anthropic": {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY isn't set (templates are used instead).");
      const res = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`Anthropic answered HTTP ${res.status}`);
      return "API key accepted";
    }
    case "resend":
      if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY isn't set (digest emails are skipped).");
      return "API key is set";
  }
}

export async function disconnectAction(form: FormData) {
  const actor = await requireOwner();
  const provider = z.enum(["meta", "google", "higgsfield"]).parse(form.get("provider")) as Provider;
  await attempt(BACK, async () => {
    await disconnect(provider, actor.userId);
    return { ok: `${provider} disconnected` };
  });
}

/* ---------------------------------------------------------------- Meta API mode */

export async function buildViaApiAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const back = `/dashboard/campaigns/${id}`;
  await attempt(back, async () => {
    const { buildPlanViaApi } = await import("@/lib/meta/build");
    const r = await buildPlanViaApi(id, actor);
    return { ok: `Built in Meta, PAUSED: campaign ${r.campaignId}, ${r.adSetIds?.length ?? 0} ad set(s), ${r.adIds?.length ?? 0} ad(s).` };
  });
}

export async function saveLeadFormAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const leadFormId = String(form.get("leadFormId") ?? "").replace(/\D/g, "");
  await attempt(`/dashboard/campaigns/${id}`, async () => {
    const [plan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, id));
    if (!plan) throw new Error("Plan not found");
    await db.update(schema.campaignPlans).set({ metaIds: { ...(plan.metaIds as object), leadFormId: leadFormId || undefined } }).where(eq(schema.campaignPlans.id, id));
    await logAudit({ actorType: "user", actorId: actor.userId, action: "campaign.lead_form_set", entityTable: "campaign_plans", entityId: id, details: { leadFormId } });
  });
}

export async function verifyAccessAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("clientId"));
  await attempt(`/dashboard/clients/${id}`, async () => {
    const { verifyClientAccess } = await import("@/lib/meta/service");
    const r = await verifyClientAccess(id, actor.userId);
    return r.problems.length ? { error: `Access check: ${r.problems.join("; ")}` } : { ok: `Access verified — ad account ${r.adAccount.name ?? ""}, Page ${r.page.ok ? "found" : "missing"}, pixel ${r.pixel.ok ? "found" : "not found"}${r.spendCap.set ? ", spending limit set" : ""}.` };
  });
}

export async function pullInsightsAction(form: FormData) {
  await requireStaff();
  const id = uuid.parse(form.get("clientId"));
  await attempt(`/dashboard/clients/${id}?tab=performance`, async () => {
    const { pullInsights } = await import("@/lib/meta/service");
    const { astDateString } = await import("@/lib/time");
    const now = new Date();
    const r = await pullInsights(id, astDateString(new Date(now.getTime() - 28 * 86_400_000)), astDateString(new Date(now.getTime() - 86_400_000)));
    return { ok: `${r.rows} daily ad row(s) pulled from Meta (last 28 days).` };
  });
}

export async function pullLeadsAction(form: FormData) {
  await requireStaff();
  const id = uuid.parse(form.get("clientId"));
  await attempt(`/dashboard/clients/${id}?tab=leads`, async () => {
    const { pullMetaLeads } = await import("@/lib/meta/service");
    const r = await pullMetaLeads(id);
    return { ok: `${r.added} new lead(s) from ${r.forms} form(s).` };
  });
}

export async function updateMetaLeadAction(form: FormData) {
  await requireStaff();
  const id = uuid.parse(form.get("id"));
  const clientId = uuid.parse(form.get("clientId"));
  const status = z.enum(["new", "contacted", "qualified", "sold", "junk"]).parse(form.get("status"));
  await attempt(`/dashboard/clients/${clientId}?tab=leads`, async () => {
    await db.update(schema.metaLeads).set({ status }).where(eq(schema.metaLeads.id, id));
  });
}

/* ---------------------------------------------------------------- WiPay */

export async function issuePayLinkAction(form: FormData) {
  const actor = await requireOwner();
  const id = uuid.parse(form.get("id"));
  await attempt(`/dashboard/billing/${id}`, async () => {
    const { issuePayLink } = await import("@/lib/payments");
    await issuePayLink(id, actor.userId);
    return { ok: "New pay link created. The old one no longer works." };
  });
}

/* ---------------------------------------------------------------- Higgsfield */

export async function generateVariantAction(form: FormData) {
  const actor = await requireStaff();
  const assetId = uuid.parse(form.get("assetId"));
  const clientId = uuid.parse(form.get("clientId"));
  const format = z.enum(["1:1", "4:5", "9:16"]).parse(form.get("format"));
  const kind = z.enum(["image", "video"]).parse(form.get("kind"));
  await attempt(`/dashboard/clients/${clientId}?tab=assets`, async () => {
    const { startGeneration } = await import("@/lib/creatives/generate");
    await startGeneration({ assetId, format, kind, prompt: String(form.get("prompt") ?? ""), actorId: actor.userId });
    return { ok: "Generation started — it appears here in a few minutes (checked every minute)." };
  });
}

/* ---------------------------------------------------------------- v2: cost per sale */

export async function addSaleAction(form: FormData) {
  const actor = await requireStaff();
  const clientId = uuid.parse(form.get("clientId"));
  await attempt(`/dashboard/clients/${clientId}?tab=performance`, async () => {
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(form.get("date"));
    const count = z.coerce.number().int().min(1).max(100).parse(form.get("count"));
    const valueRaw = String(form.get("value") ?? "").replace(/[^\d.]/g, "");
    const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
    await db.insert(schema.clientSales).values({ clientId, date, count, valueTtdCents: valueRaw ? Math.round(Number(valueRaw) * 100) : null, note: String(form.get("note") ?? "").slice(0, 300) || null, isDemo: client?.isDemo ?? false, createdBy: actor.userId });
    await logAudit({ actorType: "user", actorId: actor.userId, action: "client.sale_logged", entityTable: "clients", entityId: clientId, details: { date, count } });
    return { ok: "Sale logged." };
  });
}

/* ---------------------------------------------------------------- v2: time, expenses, winners, team */

export async function addTimeAction(form: FormData) {
  const actor = await requireStaff();
  await attempt("/dashboard/time", async () => {
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(form.get("date"));
    const minutes = z.coerce.number().int().min(1).max(16 * 60).parse(form.get("minutes"));
    const category = z.enum(["approvals", "outreach", "calls", "client_work", "creative", "admin", "other"]).parse(form.get("category"));
    await db.insert(schema.timeEntries).values({ date, minutes, category, note: String(form.get("note") ?? "").slice(0, 300) || null, createdBy: actor.userId });
    return { ok: `Logged ${minutes} min.` };
  });
}

export async function deleteTimeAction(form: FormData) {
  await requireStaff();
  const id = uuid.parse(form.get("id"));
  await attempt("/dashboard/time", async () => {
    await db.delete(schema.timeEntries).where(eq(schema.timeEntries.id, id));
  });
}

export async function addExpenseAction(form: FormData) {
  const actor = await requireOwner();
  await attempt("/dashboard/billing?tab=expenses", async () => {
    const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).parse(form.get("date"));
    const amount = Number(String(form.get("amount") ?? "").replace(/[^\d.]/g, ""));
    if (!(amount > 0)) throw new Error("Enter an amount.");
    const currency = z.enum(["TTD", "USD"]).parse(form.get("currency"));
    const category = z.enum(["software", "ai", "ads_tools", "phone_internet", "transport", "fees", "other"]).parse(form.get("category"));
    const [row] = await db.insert(schema.expenses).values({ date, amountCents: Math.round(amount * 100), currency, category, description: String(form.get("description") ?? "").slice(0, 300) || null, createdBy: actor.userId }).returning();
    await logAudit({ actorType: "user", actorId: actor.userId, action: "expense.added", entityTable: "expenses", entityId: row!.id, details: { amount, currency, category } });
    return { ok: "Expense added." };
  });
}

export async function toggleWinnerAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const back = String(form.get("back") ?? "/dashboard/creative");
  await attempt(back.startsWith("/dashboard") ? back : "/dashboard/creative", async () => {
    const [c] = await db.select().from(schema.creatives).where(eq(schema.creatives.id, id));
    if (!c) throw new Error("Creative not found");
    await db.update(schema.creatives).set({ winner: !c.winner, winnerNote: !c.winner ? String(form.get("note") ?? "").slice(0, 300) || null : null }).where(eq(schema.creatives.id, id));
    await logAudit({ actorType: "user", actorId: actor.userId, action: c.winner ? "creative.unmarked_winner" : "creative.marked_winner", entityTable: "creatives", entityId: id });
    return { ok: c.winner ? "Removed from the winning-ad library." : "Added to the winning-ad library." };
  });
}

export async function inviteMemberAction(form: FormData) {
  const actor = await requireOwner();
  await attempt("/dashboard/settings?saved=team", async () => {
    const { isEnabled } = await import("@/lib/settings");
    if (!(await isEnabled("team_seats"))) throw new Error("Turn on the Team seats flag first.");
    const email = z.string().email().parse(String(form.get("email") ?? "").trim().toLowerCase());
    await db.insert(schema.teamInvites).values({ email, role: "account_manager", status: "pending", invitedBy: actor.userId }).onConflictDoUpdate({ target: schema.teamInvites.email, set: { status: "pending", role: "account_manager", invitedBy: actor.userId } });
    await logAudit({ actorType: "user", actorId: actor.userId, action: "team.invited", entityTable: "team_invites", entityId: email });
    return { ok: `Invited ${email}. Create their login in Supabase (Authentication → Users → Add user); they get account-manager access on first sign-in with 2FA.` };
  });
}

export async function revokeMemberAction(form: FormData) {
  const actor = await requireOwner();
  const email = z.string().email().parse(form.get("email"));
  await attempt("/dashboard/settings?saved=team", async () => {
    await db.update(schema.teamInvites).set({ status: "revoked" }).where(eq(schema.teamInvites.email, email));
    const { and: andOp, ne } = await import("drizzle-orm");
    await db.update(schema.profiles).set({ role: "none" }).where(andOp(eq(schema.profiles.email, email), ne(schema.profiles.role, "owner")));
    await logAudit({ actorType: "user", actorId: actor.userId, action: "team.revoked", entityTable: "team_invites", entityId: email });
    return { ok: `${email} no longer has access.` };
  });
}
