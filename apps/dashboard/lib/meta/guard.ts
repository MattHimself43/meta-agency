/**
 * The rule that matters most in API mode: nothing reaches Meta with status ACTIVE unless the owner pressed Launch.
 *
 * - Every write is scanned (keys `status`, `configured_status`, `status_option`, at any depth, including JSON
 *   strings such as an ad spec) for ACTIVE.
 * - An activating write is only allowed with a LaunchGrant. Grants are unforgeable objects kept in a module-private
 *   WeakSet, issued only to a signed-in owner, valid for one plan, single-use and short-lived.
 * - The AI, routines and jobs never hold an owner Actor, so they cannot get a grant.
 */

export class MetaGuardError extends Error {
  readonly code = "META_ACTIVATION_REFUSED";
}

const STATUS_KEYS = new Set(["status", "configured_status", "status_option", "effective_status"]);

/** True if any status-like field in the params (deeply, including JSON-encoded strings) is ACTIVE. */
export function containsActivation(value: unknown, depth = 0): boolean {
  if (depth > 8 || value == null) return false;
  if (typeof value === "string") {
    const t = value.trim();
    if ((t.startsWith("{") || t.startsWith("[")) && /active/i.test(t)) {
      try {
        return containsActivation(JSON.parse(t), depth + 1);
      } catch {
        return false;
      }
    }
    return false;
  }
  if (Array.isArray(value)) return value.some((v) => containsActivation(v, depth + 1));
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (STATUS_KEYS.has(k.toLowerCase()) && typeof v === "string" && v.trim().toUpperCase() === "ACTIVE") return true;
      if (containsActivation(v, depth + 1)) return true;
    }
  }
  return false;
}

export type LaunchGrant = { readonly planId: string; readonly ownerId: string; readonly expiresAt: number };
const grants = new WeakSet<object>();
const used = new WeakSet<object>();

/** Only for the owner's Launch button (campaigns/service.launchPlan). */
export function issueLaunchGrant(actor: { userId: string; role: string } | null | undefined, planId: string): LaunchGrant {
  if (!actor || actor.role !== "owner") throw new MetaGuardError("Only the owner can launch a campaign.");
  const g = Object.freeze({ planId, ownerId: actor.userId, expiresAt: Date.now() + 2 * 60_000 });
  grants.add(g);
  return g;
}

/** Throws unless the grant is genuine, unexpired and for this plan. */
export function checkGrant(grant: unknown, planId: string | null): asserts grant is LaunchGrant {
  if (!grant || typeof grant !== "object" || !grants.has(grant)) throw new MetaGuardError("Refused: setting a Meta object ACTIVE needs the owner's Launch.");
  const g = grant as LaunchGrant;
  if (g.expiresAt < Date.now()) throw new MetaGuardError("Refused: the launch grant has expired. Press Launch again.");
  if (planId && g.planId !== planId) throw new MetaGuardError("Refused: the launch grant is for a different campaign.");
}

/** Mark a grant spent once the launch finished (it can cover the campaign, its ad sets and ads in one launch). */
export function spendGrant(grant: LaunchGrant) {
  used.add(grant);
  grants.delete(grant);
}
export function isSpent(grant: object) {
  return used.has(grant);
}

export type MetaCallContext = {
  /** Who is calling: a signed-in owner action, a routine/job, or the AI path. */
  origin: "owner" | "staff" | "routine" | "ai";
  planId?: string | null;
  grant?: LaunchGrant | null;
  /** Budget writes must reference the budget_changes row the guardrail approved/applied. */
  budgetChangeId?: string | null;
};

/** The single gate every Meta write goes through (see client.ts). Returns params with PAUSED forced on creates. */
export function guardWrite(path: string, params: Record<string, unknown>, ctx: MetaCallContext): Record<string, unknown> {
  if (containsActivation(params)) {
    if (ctx.origin !== "owner") throw new MetaGuardError(`Refused: the ${ctx.origin} path can never set a Meta object ACTIVE.`);
    checkGrant(ctx.grant, ctx.planId ?? null);
  }
  const isCreate = /\/act_\d+\/(campaigns|adsets|ads)$/.test(path);
  if (isCreate && params.status == null) return { ...params, status: "PAUSED" };
  return params;
}
