import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { ArrowLeft, Download } from "lucide-react";
import { db, schema } from "@/lib/db";
import { requireOwnerPage } from "@/lib/auth";
import { bankTransferText } from "@/lib/payments";
import { formatMoney } from "@/lib/money";
import { formatAst } from "@/lib/time";
import { waLink } from "@/lib/phone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Notice, PageHeader } from "@/components/page-header";
import { SendActions } from "@/components/sell/send-actions";
import { invoiceAction } from "../../deliver-actions";

export const metadata = { title: "Invoice" };

export default async function InvoicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ notice?: string; error?: string }> }) {
  await requireOwnerPage();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [inv] = await db.select().from(schema.invoices).where(eq(schema.invoices.id, id));
  if (!inv) notFound();
  const [client] = await db.select().from(schema.clients).where(eq(schema.clients.id, inv.clientId));
  const lines = await db.select().from(schema.invoiceLines).where(eq(schema.invoiceLines.invoiceId, id)).orderBy(asc(schema.invoiceLines.sortOrder));
  const payments = await db.select().from(schema.payments).where(eq(schema.payments.invoiceId, id));
  const bank = await bankTransferText();
  const msg = inv.number ? `Hi${client?.contactName ? ` ${client.contactName.split(" ")[0]}` : ""}, here's invoice ${inv.number} for ${formatMoney(inv.totalCents, "TTD")}, due ${inv.dueDate}. ${inv.paymentLink ? `Pay online: ${inv.paymentLink}` : bank} Reference: ${inv.number}. Thanks!` : "";

  return (
    <>
      <Link href="/dashboard/billing" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-brand-cyan"><ArrowLeft className="h-4 w-4" /> Billing</Link>
      <PageHeader kicker={client?.name} title={inv.number ? `Invoice ${inv.number}` : "Invoice draft"} description={`${inv.kind === "setup" ? "Setup fee" : `Management fee ${inv.periodKey}`} · ${formatMoney(inv.totalCents, "TTD")}${inv.dueDate ? ` · due ${inv.dueDate}` : ""}`} actions={<div className="flex items-center gap-2"><Badge variant={inv.status === "paid" ? "low" : inv.status === "overdue" ? "high" : "muted"}>{inv.status}</Badge><Button asChild size="sm" variant="outline"><a href={`/api/pdf/invoice/${id}`}><Download /> PDF</a></Button></div>} />
      {sp.error ? <Notice tone="error">{sp.error}</Notice> : null}
      {sp.notice ? <Notice>Saved.</Notice> : null}
      {!inv.number ? <Notice>Approve this invoice in the <Link href="/dashboard/approvals" className="underline">approval queue</Link> — that gives it the next number.</Notice> : null}
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <Table>
            <THead><TR><TH>Description</TH><TH>Qty</TH><TH>Amount</TH></TR></THead>
            <TBody>
              {lines.map((l) => <TR key={l.id}><TD className="text-sm">{l.description}</TD><TD className="text-sm">{Number(l.quantity)}</TD><TD className="text-sm">{formatMoney(l.amountCents, "TTD")}</TD></TR>)}
              {inv.vatCents ? <TR><TD className="text-sm" colSpan={2}>VAT</TD><TD className="text-sm">{formatMoney(inv.vatCents, "TTD")}</TD></TR> : null}
              <TR><TD className="font-semibold" colSpan={2}>Total</TD><TD className="font-semibold">{formatMoney(inv.totalCents, "TTD")}</TD></TR>
            </TBody>
          </Table>
          {payments.length ? <CardContent className="pt-4 text-sm text-[#7cf5c4]">{payments.map((p) => <p key={p.id}>Paid {formatMoney(p.amountCents, "TTD")} by {p.method.replace("_", " ")} on {formatAst(p.receivedAt, "d MMM yyyy")}{p.reference ? ` · ref ${p.reference}` : ""}</p>)}</CardContent> : null}
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Send &amp; get paid</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {inv.number && inv.status !== "paid" ? (
              <>
                <p className="whitespace-pre-wrap rounded-2xl border border-[var(--line)] p-3 text-sm text-[#c2d1ef]">{msg}</p>
                <SendActions channel="whatsapp" waHref={client?.whatsapp ? waLink(client.whatsapp, msg) : null} body={msg} />
                <p className="text-xs text-[#5f6f92]">Attach the PDF in WhatsApp, then mark it sent.</p>
                {inv.status === "approved" ? <form action={invoiceAction}><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value="sent" /><Button size="sm" variant="secondary">Mark sent</Button></form> : null}
                <form action={invoiceAction} className="space-y-2 border-t border-[var(--line)] pt-4">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="op" value="paid" />
                  <Field label="Payment method"><select name="method" className="h-10 w-full rounded-xl border border-[var(--line)] bg-[rgba(8,16,31,0.6)] px-3 text-sm"><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="other">Other</option></select></Field>
                  <Field label="Reference"><Input name="reference" placeholder="Bank reference" /></Field>
                  <Button size="sm">Mark paid</Button>
                </form>
              </>
            ) : inv.status === "paid" ? <p className="text-sm text-[#7cf5c4]">Paid — thank you.</p> : <p className="text-sm text-muted-foreground">Approve first.</p>}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
