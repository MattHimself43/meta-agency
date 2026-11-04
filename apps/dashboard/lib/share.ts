import "server-only";
import { headers } from "next/headers";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { findSharedDoc } from "@/lib/docs/generate";

/** Public share links: rate limited per IP, token must match an approved document. */
export async function resolveShare(kind: string, token: string) {
  if (kind !== "audit" && kind !== "proposal") return { status: "not_found" as const };
  if (!/^[A-Za-z0-9_-]{43,}$/.test(token)) return { status: "not_found" as const };
  const ip = clientIp(await headers());
  if (!(await rateLimit(`share:${ip}`, 60, 600)).ok) return { status: "rate_limited" as const };
  const row = await findSharedDoc(kind, token);
  return row ? { status: "ok" as const, row, kind } : { status: "not_found" as const };
}
