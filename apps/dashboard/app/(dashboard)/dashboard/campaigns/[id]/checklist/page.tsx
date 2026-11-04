import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { checklistFor } from "@/lib/campaigns/service";

export const metadata = { title: "Checklist" };

/** Printer-friendly checklist (white page). */
export default async function ChecklistPrint({ params }: { params: Promise<{ id: string }> }) {
  await requireStaffPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [plan] = await db.select().from(schema.campaignPlans).where(eq(schema.campaignPlans.id, id));
  if (!plan) notFound();
  const steps = await checklistFor(plan);
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-white p-8 text-[#0b1430]">
      <h1 className="text-2xl font-semibold">{plan.name}</h1>
      <p className="mb-6 text-sm text-gray-500">Ads Manager checklist — tick each box as you go. Ends with the campaign switched OFF.</p>
      <ol className="space-y-5">
        {steps.map((s) => (
          <li key={s.n}>
            <p className="font-semibold">{s.n}. {s.title}</p>
            {s.warning ? <p className="text-sm text-red-700">⚑ {s.warning}</p> : null}
            <ul className="mt-1 space-y-1">{s.items.map((it, i) => <li key={i} className="flex gap-2 text-sm"><span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 border border-gray-500" />{it}</li>)}</ul>
          </li>
        ))}
      </ol>
    </div>
  );
}
