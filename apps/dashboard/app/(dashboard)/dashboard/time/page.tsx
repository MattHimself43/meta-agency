import { desc, gte } from "drizzle-orm";
import { Trash2 } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireStaffPage } from "@/lib/auth";
import { astDateString } from "@/lib/time";
import { shiftDay as shiftDayString } from "@/lib/performance/metrics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Notice, PageHeader } from "@/components/page-header";
import { addTimeAction, deleteTimeAction } from "../connect-actions";

export const metadata = { title: "Time tracker" };
export const dynamic = "force-dynamic";

const CATEGORIES: Record<string, string> = { approvals: "Approvals", outreach: "Outreach", calls: "Calls", client_work: "Client work", creative: "Creative", admin: "Admin", other: "Other" };
const TARGET_MIN_PER_WEEK = 4 * 60;
const sel = "h-10 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm text-foreground";
const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

/** v2: is the business really running on ~15 minutes a day / ~4 hours a week? */
export default async function TimePage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  await requireStaffPage();
  const sp = await searchParams;
  const today = astDateString();
  const from = shiftDayString(today, -27);
  const rows = await db.select().from(schema.timeEntries).where(gte(schema.timeEntries.date, from)).orderBy(desc(schema.timeEntries.date), desc(schema.timeEntries.createdAt));
  const weekFrom = shiftDayString(today, -6);
  const week = rows.filter((r) => r.date >= weekFrom);
  const weekMin = week.reduce((s, r) => s + r.minutes, 0);
  const byCat = Object.entries(week.reduce<Record<string, number>>((a, r) => ({ ...a, [r.category ?? "other"]: (a[r.category ?? "other"] ?? 0) + r.minutes }), {})).sort((a, b) => b[1] - a[1]);
  const pct = Math.min(100, Math.round((weekMin / TARGET_MIN_PER_WEEK) * 100));

  return (
    <>
      <PageHeader kicker="Business" title="Time tracker" description="Target: about 15 minutes a day and 4 hours a week at 3 clients. The Friday review reads these numbers." />
      {sp.error ? <Notice tone="error">{sp.error}</Notice> : null}
      {sp.notice ? <Notice>{sp.notice === "saved" ? "Saved." : sp.notice}</Notice> : null}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Last 7 days</CardTitle><CardDescription>{hm(weekMin)} of a {hm(TARGET_MIN_PER_WEEK)} target</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} className="h-2.5 overflow-hidden rounded-full bg-white/5">
              <div className={`h-full rounded-full ${weekMin > TARGET_MIN_PER_WEEK ? "bg-amber-300" : "btn-grad"}`} style={{ width: `${pct}%` }} />
            </div>
            <ul className="space-y-1 text-sm">{byCat.map(([c, m]) => <li key={c} className="flex justify-between"><span>{CATEGORIES[c] ?? c}</span><span className="text-muted-foreground">{hm(m)}</span></li>)}</ul>
            <form action={addTimeAction} className="grid grid-cols-2 gap-3 border-t border-[var(--line)] pt-4">
              <Field label="Date"><Input name="date" type="date" defaultValue={today} /></Field>
              <Field label="Minutes"><Input name="minutes" type="number" min={1} max={960} defaultValue={15} /></Field>
              <Field label="What"><select name="category" className={sel} defaultValue="approvals">{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <Field label="Note"><Input name="note" placeholder="optional" /></Field>
              <Button size="sm" className="col-span-2">Log time</Button>
            </form>
          </CardContent>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader><CardTitle>Last 4 weeks</CardTitle></CardHeader>
          <CardContent>
            {rows.length ? (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {rows.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span><span className="text-muted-foreground">{r.date}</span> · {CATEGORIES[r.category ?? "other"] ?? r.category} · {hm(r.minutes)}{r.note ? <span className="text-muted-foreground"> · {r.note}</span> : null}</span>
                    <form action={deleteTimeAction}><input type="hidden" name="id" value={r.id} /><Button size="icon" variant="ghost" aria-label="Delete entry"><Trash2 /></Button></form>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">Nothing logged yet.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
