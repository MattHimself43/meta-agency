import { forReview } from "@/lib/creatives/service";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { PortalShell, portalClient } from "../shell";
import { reviewAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Review your ads", robots: { index: false, follow: false } };

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const client = await portalClient(token);
  const items = await forReview(client.id);
  return (
    <PortalShell token={token} kicker="Your ads" title="Check your ads" error={sp.error} notice={sp.notice}>
      <p className="text-sm text-muted-foreground">Please check every price, deposit and offer is right. Nothing runs until you approve it.</p>
      {items.length === 0 ? <p className="glass rounded-[22px] p-5 text-sm text-muted-foreground">Nothing waiting for you right now.</p> : null}
      {items.map((c) => (
        <article key={c.id} className="glass-strong space-y-3 rounded-[22px] p-5">
          {c.mediaPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/files/${c.mediaPath}?t=${token}`} alt="" className="w-full rounded-2xl" />
          ) : null}
          <p className="font-display text-lg font-semibold">{c.hook}</p>
          <p className="whitespace-pre-wrap text-sm text-[#c2d1ef]">{c.primaryText}</p>
          <div className="flex items-center justify-between rounded-2xl border border-[var(--line)] p-3 text-sm">
            <span className="font-semibold">{c.headline}</span>
            <span className="btn-ghost-line rounded-full px-3 py-1 text-xs">{c.cta}</span>
          </div>
          <form action={reviewAction} className="space-y-2">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="id" value={c.id} />
            <Textarea name="comment" rows={2} placeholder="Anything to change? (needed if you ask for changes)" />
            <div className="flex gap-2">
              <Button type="submit" name="decision" value="approved" className="flex-1">Approve</Button>
              <Button type="submit" name="decision" value="rejected" variant="outline" className="flex-1">Ask for changes</Button>
            </div>
          </form>
        </article>
      ))}
    </PortalShell>
  );
}
