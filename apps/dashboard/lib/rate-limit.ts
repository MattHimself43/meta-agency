import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

/**
 * Fixed-window rate limiter backed by Postgres (works across Vercel instances without Redis).
 * Used on public routes: /portal, /book, share links, webhooks.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<{ ok: boolean; remaining: number }> {
  const rows = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, window_start, count) VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1 ELSE rate_limits.count + 1 END,
      window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now() ELSE rate_limits.window_start END
    RETURNING count
  `);
  const count = Number((rows[0] as { count: number } | undefined)?.count ?? 0);
  return { ok: count <= limit, remaining: Math.max(0, limit - count) };
}

export function clientIp(headers: Headers): string {
  return headers.get("x-real-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
