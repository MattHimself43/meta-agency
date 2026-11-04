import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { isEnabled } from "@/lib/settings";
import { logAudit } from "@/lib/audit";

/**
 * Team seats (v2, behind the `team_seats` flag). The owner invites an email; the person's Supabase login is
 * created by the owner (sign-ups stay off). On their first 2FA-verified sign-in the invite turns into the
 * account_manager role: no billing, no settings, cannot launch campaigns or raise budgets (enforced server-side).
 */
export async function acceptInvite(userId: string, email: string): Promise<"account_manager" | null> {
  if (!(await isEnabled("team_seats"))) return null;
  const [invite] = await db.select().from(schema.teamInvites).where(and(eq(schema.teamInvites.email, email.toLowerCase()), eq(schema.teamInvites.status, "pending")));
  if (!invite) return null;
  await db.update(schema.profiles).set({ role: "account_manager" }).where(and(eq(schema.profiles.id, userId), eq(schema.profiles.role, "none")));
  await db.update(schema.teamInvites).set({ status: "accepted", acceptedAt: new Date() }).where(eq(schema.teamInvites.id, invite.id));
  await logAudit({ actorType: "user", actorId: userId, action: "team.invite_accepted", entityTable: "team_invites", entityId: email });
  return "account_manager";
}

export async function teamMembers() {
  const [invites, staff] = await Promise.all([
    db.select().from(schema.teamInvites),
    db.select({ email: schema.profiles.email, role: schema.profiles.role, name: schema.profiles.fullName }).from(schema.profiles).where(eq(schema.profiles.role, "account_manager")),
  ]);
  return { invites, staff };
}
