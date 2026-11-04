import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { schema, type Tx } from "@/lib/db";
import { generateToken, hashToken } from "@/lib/crypto";
import { logAudit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import { draftInvoice } from "@/lib/billing/invoices";
import { ONBOARDING_STEPS } from "./onboarding-steps";

type Lead = typeof schema.leads.$inferSelect;

/**
 * Won → client. Creates the client, a portal token (raw token returned once, only its hash stored),
 * the onboarding steps and the setup-fee invoice draft (into the approval queue).
 * Idempotent: a lead that already has a client returns it.
 */
export async function createClientFromLead(tx: Tx, lead: Lead, actorId: string | null) {
  const [existing] = await tx.select().from(schema.clients).where(eq(schema.clients.leadId, lead.id)).limit(1);
  if (existing) return { client: existing, portalToken: null as string | null, created: false };

  const settings = await getSettings();
  // Package: what the latest proposal suggested, else the recommended package.
  const [proposal] = await tx
    .select({ content: schema.proposals.content })
    .from(schema.proposals)
    .where(eq(schema.proposals.leadId, lead.id))
    .orderBy(sql`created_at desc`)
    .limit(1);
  const suggested = (proposal?.content as { package_slug?: string } | undefined)?.package_slug;
  const pkgs = await tx.select().from(schema.packages).where(eq(schema.packages.active, true));
  const pkg = pkgs.find((p) => p.slug === suggested) ?? pkgs.find((p) => p.recommended) ?? pkgs[0];

  const [{ waived }] = (await tx.execute(sql`SELECT count(*)::int AS waived FROM clients WHERE setup_fee_waived`)) as unknown as [{ waived: number }];
  const waive = settings.foundingOfferEnabled && waived < settings.foundingOfferSlots;

  const portalToken = generateToken();
  const [client] = await tx
    .insert(schema.clients)
    .values({
      leadId: lead.id,
      nicheId: lead.nicheId,
      name: lead.businessName,
      contactName: lead.contactName,
      whatsapp: lead.whatsapp ?? lead.phone,
      email: lead.email,
      packageId: pkg?.id,
      status: "onboarding",
      portalTokenHash: hashToken(portalToken),
      portalTokenRotatedAt: new Date(),
      setupFeeWaived: waive,
      isDemo: lead.isDemo,
      createdBy: actorId,
    })
    .returning();

  await tx.insert(schema.onboardingSteps).values(
    ONBOARDING_STEPS.map((s, i) => ({ clientId: client!.id, ...s, sortOrder: i, isDemo: lead.isDemo })),
  );

  if (pkg && !waive && pkg.setupFeeCents > 0) {
    await draftInvoice(tx, {
      clientId: client!.id,
      kind: "setup",
      periodKey: "setup",
      clientName: client!.name,
      lines: [{ description: `${pkg.name} package — one-time setup`, unitCents: pkg.setupFeeCents }],
      requestedBy: "system",
      isDemo: lead.isDemo,
    });
  }

  await tx.insert(schema.activities).values({
    clientId: client!.id,
    leadId: lead.id,
    type: "note",
    body: `Client created from won lead. Package: ${pkg?.name ?? "—"}.${waive ? " Founding-client offer: setup fee waived." : ""}`,
    isDemo: lead.isDemo,
    createdBy: actorId,
  });
  await logAudit(
    {
      actorType: actorId ? "user" : "system",
      actorId,
      action: "client.created_from_lead",
      entityTable: "clients",
      entityId: client!.id,
      details: { leadId: lead.id, package: pkg?.slug, setupFeeWaived: waive },
    },
    tx,
  );
  return { client: client!, portalToken, created: true };
}

export async function clientForLead(tx: Tx, leadId: string) {
  const [c] = await tx.select().from(schema.clients).where(and(eq(schema.clients.leadId, leadId))).limit(1);
  return c ?? null;
}
