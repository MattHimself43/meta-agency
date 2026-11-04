"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { requireOwner, requireStaff } from "@/lib/auth";
import { approveAllLowRisk, decideApproval, editApproval } from "@/lib/approvals";
import { APPROVAL_TYPES } from "@/lib/approvals/types";
import { logAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { runRoutine } from "@/lib/routines/runner";
import { validateCron } from "@/lib/routines/schedule";
import { DEFAULT_FLAGS } from "@/lib/flags";
import type { FeatureFlags } from "@/lib/db/schema";

const uuid = z.string().uuid();

async function ip() {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/* -------------------------- Approvals -------------------------- */

export async function approveAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  await decideApproval(id, "approve", actor, (form.get("note") as string) || undefined);
  revalidatePath("/dashboard", "layout");
}

export async function rejectAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  await decideApproval(id, "reject", actor, (form.get("note") as string) || undefined);
  revalidatePath("/dashboard", "layout");
}

export async function editApprovalAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const body = z.string().max(10_000).parse(form.get("body"));
  await editApproval(id, { body }, actor);
  revalidatePath("/dashboard", "layout");
}

export async function approveAllLowRiskAction() {
  const actor = await requireStaff();
  await approveAllLowRisk(actor);
  revalidatePath("/dashboard", "layout");
}

/* -------------------------- Alerts -------------------------- */

export async function resolveAlertAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  await db.update(schema.alerts).set({ resolvedAt: new Date() }).where(eq(schema.alerts.id, id));
  await logAudit({ actorType: "user", actorId: actor.userId, action: "alert.resolved", entityTable: "alerts", entityId: id });
  revalidatePath("/dashboard");
}

/* -------------------------- Routines -------------------------- */

export async function toggleRoutineAction(form: FormData) {
  const actor = await requireOwner();
  const id = uuid.parse(form.get("id"));
  const enabled = form.get("enabled") === "on";
  // When switching on, start from "now" so we don't fire an occurrence from before it was enabled.
  await db
    .update(schema.routines)
    .set(enabled ? { enabled, lastScheduledFor: new Date() } : { enabled })
    .where(eq(schema.routines.id, id));
  await logAudit({ actorType: "user", actorId: actor.userId, action: enabled ? "routine.enabled" : "routine.disabled", entityTable: "routines", entityId: id });
  revalidatePath("/dashboard/routines", "layout");
}

const scheduleSchema = z.object({
  id: uuid,
  cron: z.string().trim().min(9).max(100),
  everyNWeeks: z.coerce.number().int().min(1).max(8),
  anchorDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .or(z.literal(""))
    .transform((v) => v || null),
});

export async function updateRoutineScheduleAction(form: FormData) {
  const actor = await requireOwner();
  const input = scheduleSchema.parse(Object.fromEntries(form));
  const err = validateCron(input.cron);
  if (err) redirect(`/dashboard/routines/${input.id}?error=${encodeURIComponent(err)}`);
  if (input.everyNWeeks > 1 && !input.anchorDate) redirect(`/dashboard/routines/${input.id}?error=${encodeURIComponent("Pick an anchor date for every-N-weeks schedules")}`);
  const [before] = await db.select().from(schema.routines).where(eq(schema.routines.id, input.id));
  await db
    .update(schema.routines)
    .set({ cron: input.cron, everyNWeeks: input.everyNWeeks, anchorDate: input.anchorDate, lastScheduledFor: new Date() })
    .where(eq(schema.routines.id, input.id));
  await logAudit({
    actorType: "user",
    actorId: actor.userId,
    action: "routine.schedule_changed",
    entityTable: "routines",
    entityId: input.id,
    details: { before: { cron: before?.cron, everyNWeeks: before?.everyNWeeks, anchorDate: before?.anchorDate }, after: input },
  });
  revalidatePath("/dashboard/routines", "layout");
  redirect(`/dashboard/routines/${input.id}?saved=1`);
}

export async function runRoutineNowAction(form: FormData) {
  const actor = await requireStaff();
  const id = uuid.parse(form.get("id"));
  const [routine] = await db.select().from(schema.routines).where(eq(schema.routines.id, id));
  if (!routine) throw new Error("Routine not found");
  await logAudit({ actorType: "user", actorId: actor.userId, action: "routine.run_now", entityTable: "routines", entityId: id });
  await runRoutine(routine, { trigger: "manual", scheduledFor: null, deadline: Date.now() + 50_000, actorId: actor.userId });
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/routines/${id}`);
}

/* -------------------------- Settings -------------------------- */

const text = (max = 200) => z.string().trim().max(max);
const optionalText = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

const profileSchema = z.object({
  agencyName: text().min(1),
  ownerName: text().min(1),
  ownerEmail: optionalText().pipe(z.string().email().nullable()),
  ownerWhatsapp: optionalText(30),
  digestEmail: optionalText().pipe(z.string().email().nullable()),
  address: text(500),
  registrationNumber: text(),
  vatNumber: optionalText(),
  bank: text(),
  accountName: text(),
  accountNumber: text(),
  branch: text(),
  accountType: text(),
  invoicePrefix: text(20).min(1),
  nextInvoiceNumber: z.coerce.number().int().min(1),
  invoiceDueDays: z.coerce.number().int().min(0).max(90),
  vatRate: z.coerce.number().min(0).max(100),
});

export async function updateProfileAction(form: FormData) {
  const actor = await requireOwner();
  const i = profileSchema.parse(Object.fromEntries(form));
  const before = await getSettings();
  // Invoice numbers must never go backwards (sequential numbering).
  const nextInvoiceNumber = Math.max(i.nextInvoiceNumber, before.nextInvoiceNumber);
  const patch = {
    agencyName: i.agencyName,
    ownerName: i.ownerName,
    ownerEmail: i.ownerEmail,
    ownerWhatsapp: i.ownerWhatsapp,
    digestEmail: i.digestEmail,
    addressLines: i.address.split("\n").map((l) => l.trim()).filter(Boolean),
    registrationNumber: i.registrationNumber,
    vatNumber: i.vatNumber,
    bankDetails: { bank: i.bank, accountName: i.accountName, accountNumber: i.accountNumber, branch: i.branch, accountType: i.accountType },
    invoicePrefix: i.invoicePrefix,
    nextInvoiceNumber,
    invoiceDueDays: i.invoiceDueDays,
    vatEnabled: form.get("vatEnabled") === "on",
    vatRateBps: Math.round(i.vatRate * 100),
    foundingOfferEnabled: form.get("foundingOfferEnabled") === "on",
  };
  await db.update(schema.settings).set(patch).where(eq(schema.settings.id, 1));
  await logAudit({ actorType: "user", actorId: actor.userId, action: "settings.profile_updated", entityTable: "settings", entityId: "1", details: { fields: Object.keys(patch) }, ip: await ip() });
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/settings?saved=profile");
}

const operationsSchema = z.object({
  exchangeRate: z.coerce.number().min(1).max(50),
  limitWhatsapp: z.coerce.number().int().min(0).max(200),
  limitEmail: z.coerce.number().int().min(0).max(500),
  limitDm: z.coerce.number().int().min(0).max(200),
  budgetChangeLimit: z.coerce.number().min(0).max(100000),
});

export async function updateOperationsAction(form: FormData) {
  const actor = await requireOwner();
  const i = operationsSchema.parse(Object.fromEntries(form));
  const rules: Record<string, boolean> = {};
  for (const [type, info] of Object.entries(APPROVAL_TYPES)) {
    // Only auto-approvable types can ever be stored as true.
    if (info.autoApprovable) rules[type] = form.get(`auto_${type}`) === "on";
  }
  await db
    .update(schema.settings)
    .set({
      exchangeRate: i.exchangeRate.toFixed(4),
      sendLimits: { whatsapp: i.limitWhatsapp, email: i.limitEmail, dm: i.limitDm },
      autoApproveRules: rules,
      budgetChangeLimitCents: Math.round(i.budgetChangeLimit * 100),
    })
    .where(eq(schema.settings.id, 1));
  await logAudit({ actorType: "user", actorId: actor.userId, action: "settings.operations_updated", entityTable: "settings", entityId: "1", details: { ...i, autoApproveRules: rules }, ip: await ip() });
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/settings?saved=operations");
}

export async function updateFlagsAction(form: FormData) {
  const actor = await requireOwner();
  const before = await getSettings();
  const flags = Object.fromEntries(Object.keys(DEFAULT_FLAGS).map((k) => [k, form.get(k) === "on"])) as FeatureFlags;
  await db.update(schema.settings).set({ featureFlags: flags }).where(eq(schema.settings.id, 1));
  await logAudit({ actorType: "user", actorId: actor.userId, action: "settings.flags_updated", entityTable: "settings", entityId: "1", details: { before: before.featureFlags, after: flags }, ip: await ip() });
  revalidatePath("/dashboard", "layout");
  redirect("/dashboard/settings?saved=flags");
}
