import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";

/**
 * Integration credentials. Tokens are AES-256-GCM encrypted (TOKEN_ENCRYPTION_KEY) and only ever decrypted
 * on the server, right before a request. Nothing in this module is importable from client components.
 */
export const PROVIDERS = ["meta", "google", "higgsfield", "wipay", "anthropic", "resend"] as const;
export type Provider = (typeof PROVIDERS)[number];
export type IntegrationStatus = "connected" | "expired" | "not_set_up" | "disabled" | "error";

export type SafeIntegration = {
  provider: Provider;
  status: IntegrationStatus;
  hasSecret: boolean;
  accountLabel: string | null;
  tokenExpiresAt: Date | null;
  lastCheckedAt: Date | null;
  lastError: string | null;
  config: Record<string, unknown>;
};

async function row(provider: Provider) {
  const [r] = await db.select().from(schema.integrations).where(eq(schema.integrations.provider, provider));
  return r ?? null;
}

/** Integration state without the secret (safe to pass to a page). */
export async function getIntegration(provider: Provider): Promise<SafeIntegration> {
  const r = await row(provider);
  const expired = r?.tokenExpiresAt ? r.tokenExpiresAt.getTime() < Date.now() : false;
  return {
    provider,
    status: !r ? "not_set_up" : expired && r.status === "connected" ? "expired" : r.status,
    hasSecret: Boolean(r?.encryptedToken),
    accountLabel: r?.accountLabel ?? null,
    tokenExpiresAt: r?.tokenExpiresAt ?? null,
    lastCheckedAt: r?.lastCheckedAt ?? null,
    lastError: r?.lastError ?? null,
    config: (r?.config as Record<string, unknown>) ?? {},
  };
}

export async function listIntegrations(): Promise<Record<Provider, SafeIntegration>> {
  const out = {} as Record<Provider, SafeIntegration>;
  for (const p of PROVIDERS) out[p] = await getIntegration(p);
  return out;
}

/** Decrypted secret, or null. Server-only; never return this to a client component. */
export async function readSecret(provider: Provider): Promise<string | null> {
  const r = await row(provider);
  if (!r?.encryptedToken) return null;
  return decryptSecret(r.encryptedToken);
}

export async function saveSecret(
  provider: Provider,
  secret: string,
  opts: { label?: string | null; expiresAt?: Date | null; config?: Record<string, unknown>; actorId: string | null; status?: IntegrationStatus },
) {
  const encryptedToken = encryptSecret(secret);
  const values = {
    provider,
    encryptedToken,
    status: opts.status ?? ("connected" as const),
    accountLabel: opts.label ?? null,
    tokenExpiresAt: opts.expiresAt ?? null,
    lastCheckedAt: new Date(),
    lastError: null,
    ...(opts.config ? { config: opts.config } : {}),
  };
  await db.insert(schema.integrations).values(values).onConflictDoUpdate({ target: schema.integrations.provider, set: values });
  await logAudit({ actorType: opts.actorId ? "user" : "system", actorId: opts.actorId, action: "integration.connected", entityTable: "integrations", entityId: provider, details: { label: opts.label ?? null } });
}

export async function updateConfig(provider: Provider, config: Record<string, unknown>, actorId: string | null) {
  const current = await getIntegration(provider);
  const merged = { ...current.config, ...config };
  await db
    .insert(schema.integrations)
    .values({ provider, config: merged, status: current.status === "not_set_up" ? "not_set_up" : current.status })
    .onConflictDoUpdate({ target: schema.integrations.provider, set: { config: merged } });
  await logAudit({ actorType: actorId ? "user" : "system", actorId, action: "integration.config_changed", entityTable: "integrations", entityId: provider, details: { keys: Object.keys(config) } });
}

export async function markChecked(provider: Provider, ok: boolean, error?: string | null, extra?: { label?: string | null; expiresAt?: Date | null }) {
  const set = {
    lastCheckedAt: new Date(),
    lastError: ok ? null : (error ?? "Check failed").slice(0, 500),
    status: ok ? ("connected" as const) : ("error" as const),
    ...(extra?.label !== undefined ? { accountLabel: extra.label } : {}),
    ...(extra?.expiresAt !== undefined ? { tokenExpiresAt: extra.expiresAt } : {}),
  };
  await db.insert(schema.integrations).values({ provider, ...set }).onConflictDoUpdate({ target: schema.integrations.provider, set });
}

export async function disconnect(provider: Provider, actorId: string) {
  await db
    .update(schema.integrations)
    .set({ encryptedToken: null, status: "not_set_up", accountLabel: null, tokenExpiresAt: null, lastError: null })
    .where(eq(schema.integrations.provider, provider));
  await logAudit({ actorType: "user", actorId, action: "integration.disconnected", entityTable: "integrations", entityId: provider });
}
