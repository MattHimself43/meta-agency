import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { supabaseServer } from "@/lib/supabase/server";

export type Role = "owner" | "account_manager" | "none";
export type Actor = { userId: string; email: string; role: Role; name: string | null };

export class AuthError extends Error {
  constructor(message: string, readonly status: 401 | 403 = 403) {
    super(message);
  }
}

/** Verified current user (JWT checked by getClaims) with their profile role. Null when signed out or not 2FA-verified. */
export const currentActor = cache(async (): Promise<Actor | null> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub || claims.aal !== "aal2") return null;
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.id, claims.sub)).limit(1);
  if (!profile) return null;
  if (profile.role === "none") {
    // v2 team seats: a pending invite for this email becomes account-manager access on first 2FA sign-in.
    const { acceptInvite } = await import("@/lib/team");
    const role = await acceptInvite(profile.id, profile.email);
    if (role) return { userId: profile.id, email: profile.email, role, name: profile.fullName };
  }
  return { userId: profile.id, email: profile.email, role: profile.role, name: profile.fullName };
});

/** For pages: redirect away if not staff. */
export async function requireStaffPage(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/login");
  if (actor.role === "none") redirect("/login?error=no_access");
  return actor;
}

export async function requireOwnerPage(): Promise<Actor> {
  const actor = await requireStaffPage();
  if (actor.role !== "owner") redirect("/dashboard?error=owner_only");
  return actor;
}

/** For server actions / route handlers: throw instead of redirecting. */
export async function requireStaff(): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) throw new AuthError("Not signed in with two-factor", 401);
  if (actor.role === "none") throw new AuthError("No access");
  return actor;
}

export async function requireOwner(): Promise<Actor> {
  const actor = await requireStaff();
  if (actor.role !== "owner") throw new AuthError("Owner only");
  return actor;
}

/** Capability map used by both UI (to hide buttons) and server (to enforce). */
export const can = {
  billing: (r: Role) => r === "owner",
  settings: (r: Role) => r === "owner",
  launchCampaign: (r: Role) => r === "owner",
  raiseBudget: (r: Role) => r === "owner",
  approve: (r: Role, risk: "low" | "medium" | "high") => r === "owner" || (r === "account_manager" && risk === "low"),
};
