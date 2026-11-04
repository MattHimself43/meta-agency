import { sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Board, type Card } from "./board";

export const metadata = { title: "Pipeline" };

export default async function PipelinePage() {
  await requireStaffPage();
  const rows = await db
    .select()
    .from(schema.leads)
    .orderBy(sql`coalesce(${schema.leads.fitScoreOverride}, ${schema.leads.fitScore}) desc nulls last`, schema.leads.businessName)
    .limit(600);
  const cards: Card[] = rows.map((l) => ({
    id: l.id, name: l.businessName, stage: l.stage, score: l.fitScore, override: l.fitScoreOverride, area: l.area, nextAction: l.nextAction, value: l.estimatedValueCents, dnc: l.doNotContact,
  }));
  return (
    <>
      <PageHeader kicker="Sell" title="Pipeline" description="Drag a card to move it (on a phone, use the menu on each card). Every move is logged. Won creates the client; Lost asks why." />
      <Board cards={cards} />
    </>
  );
}
