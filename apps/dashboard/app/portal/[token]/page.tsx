import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { CheckCircle2, ChevronRight, Circle, FileText, Images, KeyRound, PenLine, Sparkles } from "lucide-react";
import { db, schema } from "@/lib/db";
import { steps } from "@/lib/clients/onboarding";
import { formatAst } from "@/lib/time";
import { PortalShell, portalClient } from "./shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your onboarding", robots: { index: false, follow: false } };

const STEP_LINK: Record<string, { path: string; icon: typeof PenLine; blurb: string }> = {
  agreement: { path: "/agreement", icon: PenLine, blurb: "Read and sign — about 2 minutes" },
  intake: { path: "/intake", icon: FileText, blurb: "Your stock, prices and offers — the only facts we'll use in ads" },
  assets: { path: "/assets", icon: Images, blurb: "Photos, videos, your logo and brand colours" },
  meta_access: { path: "/meta", icon: KeyRound, blurb: "Give us partner access in Meta — step-by-step guide" },
};
const DONE_MSG: Record<string, string> = { agreement: "Signed — thank you!", intake: "Got it — thank you!", assets: "Uploads saved — thank you!", meta_access: "Thanks! We'll check the access on our side." };

export default async function PortalHome({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const sp = await searchParams;
  const client = await portalClient(token);
  const all = await steps(client.id);
  const clientSteps = all.filter((s) => !s.ownerOnly);
  const ownerSteps = all.filter((s) => s.ownerOnly);
  const done = all.filter((s) => s.status === "done").length;
  const pct = all.length ? Math.round((done / all.length) * 100) : 0;
  const [review, reports] = await Promise.all([
    db.select({ id: schema.creatives.id }).from(schema.creatives).where(and(eq(schema.creatives.clientId, client.id), eq(schema.creatives.status, "client_review"))),
    db.select({ id: schema.reports.id, type: schema.reports.type, periodStart: schema.reports.periodStart }).from(schema.reports).where(and(eq(schema.reports.clientId, client.id), eq(schema.reports.status, "approved"))).orderBy(desc(schema.reports.periodStart)).limit(6),
  ]);
  const name = client.name.replace(/^Demo — /, "").replace(/ \(fictional\)$/, "");

  return (
    <PortalShell token={token} back={false} kicker={client.status === "onboarding" ? "Getting started" : "Your account"} title={`Welcome, ${client.contactName?.split(" ")[0] ?? name}`} notice={sp.done ? DONE_MSG[sp.done] : undefined}>
      <section className="glass-strong rounded-[22px] p-5">
        <div className="flex items-baseline justify-between">
          <p className="font-display font-semibold">{name}</p>
          <p className="gradient-text font-display text-2xl font-semibold">{pct}%</p>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[rgba(120,170,255,0.12)]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Onboarding progress">
          <div className="h-full rounded-full bg-[linear-gradient(100deg,#2e6bff,#4f9dff_45%,#5fe3ff)] shadow-[0_0_12px_rgba(95,227,255,0.6)]" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{pct === 100 ? "All done — we're building your first ads." : "A few quick steps and we can start building your ads. You can stop and come back any time with this link."}</p>
      </section>

      <ul className="space-y-3">
        {clientSteps.map((s, i) => {
          const meta = STEP_LINK[s.stepKey];
          const Icon = meta?.icon ?? Circle;
          const isDone = s.status === "done";
          return (
            <li key={s.id}>
              <Link href={`/portal/${token}${meta?.path ?? ""}`} className={`glass flex items-center gap-4 rounded-[22px] p-4 transition-colors hover:border-[var(--line-strong)] ${isDone ? "opacity-80" : ""}`}>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${isDone ? "bg-[rgba(60,220,160,0.12)] text-[#7cf5c4]" : "btn-grad"}`}>{isDone ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-[#5f6f92]">Step {i + 1}{isDone && s.completedAt ? ` · done ${formatAst(s.completedAt, "d MMM")}` : ""}</span>
                  <span className="block font-display font-semibold">{s.label}</span>
                  <span className="block text-sm text-muted-foreground">{meta?.blurb}</span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>

      {ownerSteps.length ? (
        <section className="rounded-[22px] border border-dashed border-[var(--line-strong)] p-4 text-sm">
          <p className="kicker mb-2">On our side</p>
          <ul className="space-y-1.5">{ownerSteps.map((s) => <li key={s.id} className="flex items-center gap-2 text-[#c2d1ef]">{s.status === "done" ? <CheckCircle2 className="h-4 w-4 text-[#7cf5c4]" /> : <Circle className="h-4 w-4 text-[#5f6f92]" />}{s.label}</li>)}</ul>
        </section>
      ) : null}

      {review.length ? (
        <Link href={`/portal/${token}/review`} className="glass-strong flex items-center gap-4 rounded-[22px] p-4">
          <span className="btn-grad grid h-11 w-11 place-items-center rounded-2xl"><Sparkles className="h-5 w-5" /></span>
          <span className="flex-1"><span className="block font-display font-semibold">{review.length} ad{review.length === 1 ? "" : "s"} ready for you to check</span><span className="text-sm text-muted-foreground">Approve or ask for changes</span></span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>
      ) : null}

      {client.status !== "onboarding" ? <LiveResults clientId={client.id} /> : null}
      {reports.length ? (
        <section>
          <p className="kicker mb-2">Your reports</p>
          <ul className="space-y-2">{reports.map((r) => <li key={r.id}><Link href={`/portal/${token}/reports/${r.id}`} className="glass flex items-center justify-between rounded-2xl p-3 text-sm hover:border-[var(--line-strong)]"><span>{r.type === "weekly" ? "Weekly report" : "Monthly review"} · {r.periodStart}</span><ChevronRight className="h-4 w-4" /></Link></li>)}</ul>
        </section>
      ) : null}
    </PortalShell>
  );
}

/** v2 live results: the last 30 days straight from the numbers we report on (CSV or Meta API). */
async function LiveResults({ clientId }: { clientId: string }) {
  const { rowsFor } = await import("@/lib/performance/service");
  const { totals, shiftDay } = await import("@/lib/performance/metrics");
  const { astDateString } = await import("@/lib/time");
  const to = shiftDay(astDateString(), -1);
  const rows = (await rowsFor(clientId, shiftDay(to, -29))).filter((r) => r.date <= to);
  if (!rows.length) return null;
  const t = totals(rows);
  const usd = (c: number | null) => (c == null ? "—" : `US$${(c / 100).toFixed(2)}`);
  const tiles: [string, string][] = [["Ad spend", usd(t.spend)], ["WhatsApp chats", String(t.chats)], ["Leads", String(t.leads)], ["Cost per result", usd(t.cpr)]];
  return (
    <section>
      <p className="kicker mb-2">Last 30 days · to {to}</p>
      <div className="grid grid-cols-2 gap-3">
        {tiles.map(([k, v]) => (
          <div key={k} className="glass rounded-[18px] p-4"><p className="text-xs text-muted-foreground">{k}</p><p className="mt-1 font-display text-xl font-semibold">{v}</p></div>
        ))}
      </div>
      <p className="mt-2 text-xs text-[#5f6f92]">Ad spend is paid by you to Meta. Numbers update each morning.</p>
    </section>
  );
}
