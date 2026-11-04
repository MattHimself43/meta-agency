import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { subDays } from "date-fns";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { astDateString } from "@/lib/time";
import { completeStep } from "@/lib/clients/onboarding";
import { upsertPerformanceRows } from "@/lib/performance/service";
import { actId, metaGet, metaGetAll, metaMode } from "./client";
import { INSIGHT_FIELDS, mapInsights, type InsightRow } from "./insights";

/** Integrations page test: who does the token belong to? */
export async function testMetaToken() {
  const me = await metaGet<{ id: string; name?: string }>("/me", { fields: "id,name" });
  return { label: me.name ? `${me.name} (${me.id})` : me.id };
}

/**
 * API-mode access check (onboarding): can the agency read the ad account, a Page and a pixel?
 * Ticks "Agency access verified" with evidence, and "Spending limit set" when Meta reports a spend cap.
 */
export async function verifyClientAccess(clientId: string, actorId: string | null) {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client) throw new Error("Client not found");
  const act = actId(client.adAccountId);
  const account = await metaGet<{ id: string; name?: string; account_status?: number; currency?: string; spend_cap?: string; amount_spent?: string }>(`/${act}`, { fields: "name,account_status,currency,spend_cap,amount_spent" });
  const pages = await metaGetAll<{ id: string; name?: string; link?: string }>(`/${act}/promote_pages`, { fields: "id,name,link", limit: 50 }, 2);
  const pixels = await metaGetAll<{ id: string; name?: string; last_fired_time?: string }>(`/${act}/adspixels`, { fields: "id,name,last_fired_time", limit: 50 }, 2);

  const wanted = (client.pageUrl ?? "").toLowerCase().replace(/\/$/, "");
  const page = pages.find((p) => p.link && wanted && (p.link.toLowerCase().replace(/\/$/, "") === wanted || wanted.endsWith(`/${p.id}`))) ?? pages[0] ?? null;
  const pixel = pixels[0] ?? null;
  const spendCapCents = Math.round(Number(account.spend_cap ?? 0));
  const result = {
    adAccount: { ok: account.account_status === 1, name: account.name ?? null, status: account.account_status ?? null, currency: account.currency ?? null },
    page: page ? { ok: true, id: page.id, name: page.name ?? null } : { ok: false },
    pixel: pixel ? { ok: true, id: pixel.id, lastFired: pixel.last_fired_time ?? null } : { ok: false },
    spendCap: spendCapCents > 0 ? { set: true, usdCents: spendCapCents } : { set: false },
    checkedAt: new Date().toISOString(),
  };
  await db.update(schema.clients).set({ pageId: page?.id ?? client.pageId, pixelId: pixel?.id ?? client.pixelId }).where(eq(schema.clients.id, clientId));
  const problems = [
    !result.adAccount.ok && "ad account isn't active or readable",
    !result.page.ok && "no Page the agency can promote",
    account.currency && account.currency !== "USD" && `ad account currency is ${account.currency} (plans assume USD)`,
  ].filter(Boolean) as string[];
  if (!problems.length) await completeStep(clientId, "access_check", { via: "meta_api", ...result }, { type: "user", id: actorId });
  if (result.spendCap.set) await completeStep(clientId, "spending_limit", { via: "meta_api", spend_cap_usd_cents: spendCapCents }, { type: "user", id: actorId });
  await logAudit({ actorType: actorId ? "user" : "routine", actorId, action: "meta.access_checked", entityTable: "clients", entityId: clientId, details: { ...result, problems } });
  return { ...result, problems };
}

/** Pull daily ad-level insights into performance_daily (same table the CSV import fills). */
export async function pullInsights(clientId: string, since: string, until: string) {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client?.adAccountId) return { rows: 0 };
  const rows = await metaGetAll<InsightRow>(`/${actId(client.adAccountId)}/insights`, { level: "ad", time_increment: 1, time_range: { since, until }, fields: INSIGHT_FIELDS, limit: 500 });
  const mapped = mapInsights(rows).filter((r) => r.impressions > 0 || r.spendUsdCents > 0);
  await upsertPerformanceRows(clientId, mapped, "api", client.isDemo);
  return { rows: mapped.length };
}

/** Morning check, API mode: refresh the last 7 days for every active client with an ad account. */
export async function pullAllInsights(now = new Date()) {
  if ((await metaMode()) !== "api") return { mode: "manual" as const, clients: 0, rows: 0, errors: [] as string[] };
  const clients = await db
    .select()
    .from(schema.clients)
    .where(and(inArray(schema.clients.status, ["active", "onboarding"]), eq(schema.clients.isDemo, false)));
  const until = astDateString(subDays(now, 1));
  const since = astDateString(subDays(now, 7));
  let rows = 0;
  const errors: string[] = [];
  for (const c of clients.filter((c) => c.adAccountId)) {
    try {
      rows += (await pullInsights(c.id, since, until)).rows;
    } catch (e) {
      errors.push(`${c.name}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { mode: "api" as const, clients: clients.length, rows, errors };
}

/** v2 pixel/Conversions API check: is the pixel firing recently? */
export async function pixelHealth(clientId: string) {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client?.pixelId) return { ok: false, reason: "No pixel found for this client (run the access check)." };
  const px = await metaGet<{ id: string; name?: string; last_fired_time?: string; is_unavailable?: boolean }>(`/${client.pixelId}`, { fields: "id,name,last_fired_time,is_unavailable" });
  const last = px.last_fired_time ? new Date(px.last_fired_time) : null;
  const stale = !last || Date.now() - last.getTime() > 3 * 86_400_000;
  return { ok: !stale && !px.is_unavailable, lastFired: last?.toISOString() ?? null, name: px.name ?? null, reason: stale ? "Pixel hasn't fired in 3+ days." : null };
}

/** v2 lead inbox: pull instant-form leads for the client's Page. */
export async function pullMetaLeads(clientId: string) {
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, clientId));
  if (!client?.pageId) throw new Error("Run the access check first (it finds the Page).");
  const forms = await metaGetAll<{ id: string; name?: string }>(`/${client.pageId}/leadgen_forms`, { fields: "id,name", limit: 50 }, 2);
  let added = 0;
  for (const f of forms) {
    const leads = await metaGetAll<{ id: string; created_time?: string; ad_name?: string; field_data?: { name: string; values: string[] }[] }>(`/${f.id}/leads`, { fields: "id,created_time,ad_name,field_data", limit: 100 }, 5);
    for (const l of leads) {
      const fields = Object.fromEntries((l.field_data ?? []).map((d) => [d.name, d.values.join(", ")]));
      const r = await db
        .insert(schema.metaLeads)
        .values({ clientId, metaLeadId: l.id, formId: f.id, formName: f.name ?? null, adName: l.ad_name ?? null, fields, createdTime: l.created_time ? new Date(l.created_time) : null, isDemo: client.isDemo })
        .onConflictDoNothing()
        .returning({ id: schema.metaLeads.id });
      added += r.length;
    }
  }
  return { forms: forms.length, added };
}
