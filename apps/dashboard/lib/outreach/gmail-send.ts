import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { logAudit } from "@/lib/audit";
import { googleReady, sendGmail } from "@/lib/google";
import { markSent, sentToday } from "./sequences";

/**
 * Matthias pressed "Send via Gmail" on an approved email. Same checks as Mark sent (approved, do-not-contact,
 * daily limit) run BEFORE anything leaves, then the message is sent from his Gmail and marked sent.
 */
export async function sendViaGmail(messageId: string, actorId: string) {
  if (!(await googleReady("gmail"))) throw new Error("Gmail isn't on. Turn on the Gmail flag and connect Google on the Integrations page.");
  const [msg] = await db.select().from(schema.messages).where(eq(schema.messages.id, messageId));
  if (!msg) throw new Error("Message not found");
  if (msg.channel !== "email") throw new Error("Only email messages can be sent through Gmail.");
  if (msg.status !== "approved") throw new Error("Approve this message before sending it.");
  const [lead] = msg.leadId ? await db.select().from(schema.leads).where(eq(schema.leads.id, msg.leadId)) : [];
  if (!lead?.email) throw new Error("This lead has no email address.");
  if (lead.doNotContact) throw new Error("This lead is on the do-not-contact list.");
  const limit = (await getSettings()).sendLimits.email ?? Infinity;
  if ((await sentToday("email")) >= limit) throw new Error(`Daily email limit reached (${limit}).`);
  const sent = await sendGmail({ to: lead.email, subject: msg.subject ?? `Quick idea for ${lead.businessName}`, body: msg.body ?? "" });
  await logAudit({ actorType: "user", actorId, action: "message.sent_gmail", entityTable: "messages", entityId: messageId, details: { gmailId: sent.id, threadId: sent.threadId } });
  return markSent(messageId, actorId);
}
