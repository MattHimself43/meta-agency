import "server-only";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/crypto";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logAudit } from "@/lib/audit";

export type Client = typeof schema.clients.$inferSelect;

/** Resolve a portal token to its client. Rate limited per IP; tokens are stored hashed. */
export async function resolvePortal(token: string): Promise<{ status: "ok"; client: Client } | { status: "not_found" | "rate_limited" }> {
  if (!/^[A-Za-z0-9_-]{43,}$/.test(token)) return { status: "not_found" };
  const ip = clientIp(await headers());
  if (!(await rateLimit(`portal:${ip}`, 120, 600)).ok) return { status: "rate_limited" };
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.portalTokenHash, hashToken(token)));
  return client && client.status !== "churned" ? { status: "ok", client } : { status: "not_found" };
}

/** Throwing variant for portal server actions. */
export async function requirePortal(token: string): Promise<Client> {
  const r = await resolvePortal(token);
  if (r.status !== "ok") throw new Error(r.status === "rate_limited" ? "Too many requests — try again in a few minutes." : "This link is not valid any more. Ask for a new one.");
  return r.client;
}

/** New portal link; the old one stops working immediately. Returns the raw token (shown once). */
export async function rotatePortalToken(clientId: string, actorId: string) {
  const token = generateToken();
  await db.update(schema.clients).set({ portalTokenHash: hashToken(token), portalTokenRotatedAt: new Date() }).where(eq(schema.clients.id, clientId));
  await logAudit({ actorType: "user", actorId, action: "client.portal_token_rotated", entityTable: "clients", entityId: clientId });
  return token;
}

export function portalUrl(token: string) {
  return `${process.env.APP_URL ?? ""}/portal/${token}`;
}
