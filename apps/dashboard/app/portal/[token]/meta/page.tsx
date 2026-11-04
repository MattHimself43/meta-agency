import { ImageIcon } from "lucide-react";
import { getSettings } from "@/lib/settings";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { PortalShell, portalClient } from "../shell";
import { metaAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Meta access", robots: { index: false, follow: false } };

/** Screen-by-screen guide. Screenshot slots are placeholders until real screenshots are added (public/portal/meta-N.png). */
const STEPS = [
  { title: "Open Meta Business Settings", body: "On a computer, go to business.facebook.com/settings and sign in with the Facebook account that manages your Page. (No Business Manager yet? It offers to create one — use your business name.)" },
  { title: "Add us as a partner", body: "Go to Users → Partners → Add → “Give a partner access to your assets”. Enter our Business ID: {BUSINESS_ID}." },
  { title: "Share your Facebook Page", body: "Choose Pages → your Page → turn on “Manage Page” (or Full control: Content, Messages, Ads, Insights)." },
  { title: "Share your ad account", body: "Choose Ad accounts → your ad account → turn on “Manage ad account” (Manage campaigns + View performance)." },
  { title: "Share Instagram (if you have it)", body: "Choose Instagram accounts → your account → turn on access. Connect Instagram to the Page first if you haven't." },
  { title: "Add your own card", body: "Go to Billing & payments → Payment methods → Add payment method, and add your business card. You pay Meta directly — we never see or store your card." },
  { title: "Set a spending limit", body: "In Billing & payments → Payment settings → Account spending limit, set a monthly limit (we'll agree the amount together). It's a safety net." },
  { title: "Copy your ad account ID", body: "In Ads Manager, the ad account ID is the long number at the top left (sometimes shown as act_123…). Paste it below with your Page link." },
];

export default async function MetaPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const client = await portalClient(token);
  const settings = await getSettings();
  const businessId = (settings as { metaBusinessId?: string }).metaBusinessId ?? process.env.AGENCY_META_BUSINESS_ID ?? "[we'll send it to you on WhatsApp]";

  return (
    <PortalShell token={token} kicker="Step 4" title="Give us access in Meta" error={sp.error}>
      <p className="text-sm text-muted-foreground">You keep ownership of everything: your Page, ad account and Instagram stay yours, and you can remove our access any time. Best done on a computer — about 10 minutes.</p>
      <ol className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="glass rounded-[22px] p-4">
            <div className="flex gap-3">
              <span className="btn-grad grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold">{i + 1}</span>
              <div className="min-w-0">
                <p className="font-display font-semibold">{s.title}</p>
                <p className="mt-1 text-sm text-[#c2d1ef]">{s.body.replace("{BUSINESS_ID}", businessId)}</p>
              </div>
            </div>
            <div className="mt-3 grid aspect-[16/7] place-items-center rounded-2xl border border-dashed border-[var(--line)] text-xs text-[#5f6f92]" aria-hidden="true">
              <span className="flex items-center gap-1.5"><ImageIcon className="h-4 w-4" /> Screenshot {i + 1}</span>
            </div>
          </li>
        ))}
      </ol>
      <form action={metaAction} className="glass-strong space-y-4 rounded-[22px] p-5">
        <input type="hidden" name="token" value={token} />
        <Field label="Ad account ID"><Input name="adAccountId" required inputMode="numeric" placeholder="e.g. 1234567890123456" defaultValue={client.adAccountId?.replace(/^act_/, "") ?? ""} /></Field>
        <Field label="Facebook Page link"><Input name="pageUrl" required inputMode="url" placeholder="facebook.com/yourpage" defaultValue={client.pageUrl ?? ""} /></Field>
        <Field label="Instagram (optional)"><Input name="instagram" placeholder="@yourbusiness" defaultValue={client.instagramHandle ?? ""} /></Field>
        <Field label="Your Business Manager ID (optional)"><Input name="businessId" inputMode="numeric" defaultValue={client.metaBusinessId ?? ""} /></Field>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="partner" className="mt-1 h-4 w-4 accent-[#5fe3ff]" /> I&apos;ve given partner access to my Page and ad account</label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="card" className="mt-1 h-4 w-4 accent-[#5fe3ff]" /> I&apos;ve added my own card to the ad account</label>
        <Button type="submit" size="lg" className="w-full">Done — check our access</Button>
      </form>
    </PortalShell>
  );
}
