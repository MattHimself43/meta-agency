import Link from "next/link";
import { Check } from "lucide-react";
import { todaysClientSends, todaysSends, sentToday } from "@/lib/outreach/sequences";
import { getSettings } from "@/lib/settings";
import { waLink } from "@/lib/phone";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SendActions } from "@/components/sell/send-actions";
import { markSentAction } from "@/app/(dashboard)/dashboard/sell-actions";

const PURPOSE: Record<string, string> = { outreach_opener: "Opener", followup_day3: "Day 3", followup_day7: "Day 7", reply_draft: "Reply", invoice_reminder: "Invoice reminder", onboarding_nudge: "Onboarding nudge" };

/** Approved messages due today, each with Open in WhatsApp (or email / DM) and Mark sent. */
export async function TodaySends({ back, limit }: { back: string; limit?: number }) {
  const [rows, clientRows, settings, wa, email, dm] = await Promise.all([todaysSends(), todaysClientSends(), getSettings(), sentToday("whatsapp"), sentToday("email"), sentToday("dm")]);
  const counts = { whatsapp: wa, email, dm };
  const shown = limit ? rows.slice(0, limit) : rows;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {(["whatsapp", "email", "dm"] as const).map((c) => (
          <Badge key={c} variant={counts[c] >= (settings.sendLimits[c] ?? Infinity) ? "high" : "muted"}>
            {c === "whatsapp" ? "WhatsApp" : c === "email" ? "Email" : "DM"} {counts[c]}/{settings.sendLimits[c] ?? "∞"} today
          </Badge>
        ))}
      </div>
      {clientRows.length ? (
        <ul className="mb-3 divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] px-3">
          {clientRows.map(({ message: m, client }) => (
            <li key={m.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/dashboard/clients/${client.id}`} className="font-display text-[15px] font-semibold hover:text-brand-cyan">{client.name}</Link>
                <Badge variant="medium">{PURPOSE[m.purpose] ?? m.purpose}</Badge>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-[#c2d1ef]">{m.body}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <SendActions channel="whatsapp" waHref={client.whatsapp ? waLink(client.whatsapp, m.body ?? "") : null} body={m.body ?? ""} />
                <form action={markSentAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="back" value={back} />
                  <Button size="sm" variant="secondary"><Check /> Mark sent</Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {shown.length === 0 && !clientRows.length ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nothing approved to send right now. <Link href="/dashboard/approvals" className="text-brand-cyan hover:underline">Check the approval queue</Link>.</p>
      ) : shown.length === 0 ? null : (
        <ul className="divide-y divide-[var(--line)]">
          {shown.map(({ message: m, lead }) => (
            <li key={m.id} className="py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/dashboard/leads/${lead.id}`} className="font-display text-[15px] font-semibold hover:text-brand-cyan">{lead.businessName}</Link>
                <Badge variant="muted">{PURPOSE[m.purpose] ?? m.purpose}</Badge>
                <Badge variant="default">{m.channel}</Badge>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-sm text-[#c2d1ef]">{m.body}</p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <SendActions channel={m.channel} waHref={lead.whatsapp ?? lead.phone ? waLink((lead.whatsapp ?? lead.phone)!, m.body ?? "") : null} email={lead.email} subject={m.subject ?? `Quick idea for ${lead.businessName}`} body={m.body ?? ""} pageUrl={lead.facebookUrl ?? lead.instagramUrl} />
                <form action={markSentAction}>
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="back" value={back} />
                  <Button size="sm" variant="secondary"><Check /> Mark sent</Button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
      {limit && rows.length > limit ? <Link href="/dashboard/outreach" className="mt-2 block text-sm text-brand-cyan hover:underline">See all {rows.length}</Link> : null}
    </div>
  );
}
