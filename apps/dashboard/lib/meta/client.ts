import "server-only";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { isEnabled } from "@/lib/settings";
import { readSecret } from "@/lib/integrations/store";
import { baseUrl, httpJson, IntegrationError } from "@/lib/integrations/http";
import { guardWrite, MetaGuardError, type MetaCallContext } from "./guard";

/** Marketing API version. Meta auto-upgrades old versions; bump this after reading the changelog. */
export const META_API_VERSION = process.env.META_API_VERSION || "v26.0";
const graphBase = () => `${baseUrl("META_GRAPH_URL", "https://graph.facebook.com")}/${META_API_VERSION}`;

export class MetaNotConnected extends Error {}

/** API mode = `meta_api` flag on AND a System User token saved on the Integrations page. */
export async function metaMode(): Promise<"api" | "manual"> {
  if (!(await isEnabled("meta_api"))) return "manual";
  return (await readSecret("meta")) ? "api" : "manual";
}

async function token() {
  const t = await readSecret("meta");
  if (!t) throw new MetaNotConnected("Meta isn't connected. Add the System User token on the Integrations page.");
  return t;
}

/** appsecret_proof (recommended by Meta for server calls) when META_APP_SECRET is set. */
function proof(accessToken: string) {
  const secret = process.env.META_APP_SECRET;
  return secret ? createHmac("sha256", secret).update(accessToken).digest("hex") : null;
}

function describeMetaError(body: unknown, status: number) {
  const e = (body as { error?: { message?: string; code?: number; error_subcode?: number; error_user_msg?: string } })?.error;
  if (!e) return `HTTP ${status}`;
  return `${e.error_user_msg || e.message || "error"} (code ${e.code ?? "?"}${e.error_subcode ? `/${e.error_subcode}` : ""})`;
}

function encodeParams(params: Record<string, unknown>) {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    out.set(k, typeof v === "string" ? v : JSON.stringify(v));
  }
  return out;
}

export async function metaGet<T = unknown>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const t = await token();
  const q = encodeParams({ ...params, access_token: t, appsecret_proof: proof(t) });
  return httpJson<T>("Meta", `${graphBase()}${path}?${q}`, { method: "GET" }, describeMetaError);
}

/** Follow `paging.next` cursors (insights, leads). */
export async function metaGetAll<T>(path: string, params: Record<string, unknown> = {}, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let i = 0; i < maxPages; i++) {
    const page = await metaGet<{ data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }>(path, { ...params, ...(after ? { after } : {}) });
    out.push(...(page.data ?? []));
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
    if (!after) break;
  }
  return out;
}

/**
 * Every write to Meta goes through here. guardWrite refuses ACTIVE without the owner's launch grant and forces
 * PAUSED on creates; budget writes must point at the budget_changes row the guardrail let through.
 */
export async function metaPost<T = { id?: string; success?: boolean }>(path: string, params: Record<string, unknown>, ctx: MetaCallContext, idempotencyKey?: string): Promise<T> {
  let safe: Record<string, unknown>;
  try {
    safe = guardWrite(path, params, ctx);
    if (("daily_budget" in params || "lifetime_budget" in params) && !/\/act_\d+\/(adsets|campaigns)$/.test(path)) await assertBudgetChange(params, ctx);
  } catch (e) {
    if (e instanceof MetaGuardError) {
      await logAudit({ actorType: ctx.origin === "owner" || ctx.origin === "staff" ? "user" : ctx.origin === "ai" ? "ai" : "routine", actorId: ctx.grant?.ownerId ?? null, action: "meta.write_refused", entityTable: "campaign_plans", entityId: ctx.planId ?? null, details: { path, reason: e.message } });
    }
    throw e;
  }
  const t = await token();
  const body = encodeParams({ ...safe, access_token: t, appsecret_proof: proof(t) });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (idempotencyKey) headers["X-Client-Idempotent-Key"] = idempotencyKey;
  const res = await httpJson<T>("Meta", `${graphBase()}${path}`, { method: "POST", body, headers }, describeMetaError);
  await logAudit({ actorType: ctx.origin === "owner" || ctx.origin === "staff" ? "user" : ctx.origin === "ai" ? "ai" : "routine", actorId: ctx.grant?.ownerId ?? null, action: "meta.write", entityTable: "campaign_plans", entityId: ctx.planId ?? null, details: { path, fields: Object.keys(safe), status: safe.status ?? null } });
  return res;
}

async function assertBudgetChange(params: Record<string, unknown>, ctx: MetaCallContext) {
  if (!ctx.budgetChangeId) throw new MetaGuardError("Refused: budget changes must go through the budget guardrail.");
  const [change] = await db.select().from(schema.budgetChanges).where(eq(schema.budgetChanges.id, ctx.budgetChangeId));
  const sent = Number(params.daily_budget ?? params.lifetime_budget);
  if (!change || change.status === "rejected") throw new MetaGuardError("Refused: that budget change wasn't approved.");
  // An ad set can carry a share of the plan budget, so the value sent may not exceed the approved plan budget.
  if (!(sent > 0) || sent > change.newBudgetUsdCents) throw new MetaGuardError("Refused: the budget sent doesn't match the approved change.");
}

export { IntegrationError, MetaGuardError };

/** "act_123" form from whatever the client typed. */
export function actId(adAccountId: string | null | undefined) {
  const digits = (adAccountId ?? "").replace(/\D/g, "");
  if (!digits) throw new Error("This client has no ad account ID yet (portal step 4).");
  return `act_${digits}`;
}
