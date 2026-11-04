import { desc, gte } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { astDateString } from "@/lib/time";
import { formatMoney } from "@/lib/money";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { addExpenseAction } from "@/app/(dashboard)/dashboard/connect-actions";

const CATS: Record<string, string> = { software: "Software", ai: "AI (Claude etc.)", ads_tools: "Ad tools", phone_internet: "Phone & internet", transport: "Transport", fees: "Bank/WiPay fees", other: "Other" };
const sel = "h-10 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm text-foreground";

/** v2 expenses: what the agency spends, so "collected − expenses" is real profit (TT$; US$ converted at the settings rate). */
export async function ExpensesTab({ collectedThisMonth, rate }: { collectedThisMonth: number; rate: number }) {
  const month = `${astDateString().slice(0, 7)}-01`;
  const rows = await db.select().from(schema.expenses).where(gte(schema.expenses.date, `${astDateString().slice(0, 4)}-01-01`)).orderBy(desc(schema.expenses.date));
  const ttd = (r: { amountCents: number; currency: string }) => (r.currency === "USD" ? Math.round(r.amountCents * rate) : r.amountCents);
  const thisMonth = rows.filter((r) => r.date >= month).reduce((s, r) => s + ttd(r), 0);
  return (
    <div className="grid gap-6 xl:grid-cols-5">
      <Card className="xl:col-span-2">
        <CardHeader>
          <CardTitle>This month</CardTitle>
          <CardDescription>Collected {formatMoney(collectedThisMonth, "TTD")} − expenses {formatMoney(thisMonth, "TTD")} = <b className="text-foreground">{formatMoney(collectedThisMonth - thisMonth, "TTD")}</b></CardDescription>
        </CardHeader>
        <CardContent>
          <form action={addExpenseAction} className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input name="date" type="date" defaultValue={astDateString()} /></Field>
            <Field label="Category"><select name="category" className={sel}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Amount"><Input name="amount" inputMode="decimal" required /></Field>
            <Field label="Currency"><select name="currency" className={sel}><option>TTD</option><option>USD</option></select></Field>
            <div className="col-span-2"><Field label="Description"><Input name="description" placeholder="e.g. Claude API, October" /></Field></div>
            <Button size="sm" className="col-span-2">Add expense</Button>
          </form>
        </CardContent>
      </Card>
      <Card className="xl:col-span-3">
        <CardHeader><CardTitle>This year</CardTitle></CardHeader>
        <CardContent>
          {rows.length ? <ul className="divide-y divide-[var(--line)] text-sm">{rows.map((r) => <li key={r.id} className="flex justify-between gap-3 py-2"><span><span className="text-muted-foreground">{r.date}</span> · {CATS[r.category] ?? r.category}{r.description ? ` · ${r.description}` : ""}</span><span>{formatMoney(r.amountCents, r.currency)}</span></li>)}</ul> : <p className="text-sm text-muted-foreground">No expenses yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
