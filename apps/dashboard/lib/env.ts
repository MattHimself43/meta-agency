import "server-only";
import { z } from "zod";

/**
 * Server-side environment. Only variables prefixed NEXT_PUBLIC_ are ever sent to the browser,
 * and nothing in this file is imported by client components ("server-only" enforces that).
 */
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL_FAST: z.string().default("claude-sonnet-5-5"),
  AI_MODEL_DEEP: z.string().default("claude-opus-5-5"),
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),
  TOKEN_ENCRYPTION_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  APP_URL: z.string().url().default("http://localhost:3000"),
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  HIGGSFIELD_API_KEY: z.string().optional(),
  WIPAY_ACCOUNT_NUMBER: z.string().optional(),
  WIPAY_API_KEY: z.string().optional(),
  WIPAY_ENVIRONMENT: z.enum(["sandbox", "live"]).default("sandbox"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        "Invalid environment: " + parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }
    cached = parsed.data;
  }
  return cached;
}
