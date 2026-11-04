import type { ReportContent } from "@/lib/reports/service";

const usd = (c: number | null | undefined) => (c == null ? "—" : `US$${(c / 100).toFixed(2)}`);

/** Report body — same on the dashboard, in the client portal and on the share page. */
export function ReportView({ r }: { r: ReportContent }) {
  const c = r.metrics.current;
  const tiles = [
    { k: "Ad spend", v: usd(c.spend) },
    { k: "Leads + WhatsApp chats", v: String(c.results) },
    { k: "Cost per result", v: usd(c.cpr), sub: r.targetCpr ? `target ${usd(r.targetCpr)}` : undefined },
    { k: "WhatsApp chats", v: String(c.chats) },
  ];
  const List = ({ title, items }: { title: string; items: string[] }) =>
    items.length ? (
      <section>
        <p className="kicker mb-2">{title}</p>
        <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className="flex gap-2.5 text-[#c2d1ef]"><span className="glow-dot mt-2 shrink-0" />{x}</li>)}</ul>
      </section>
    ) : null;
  return (
    <div className="space-y-6">
      <p className="font-display text-xl font-semibold leading-snug tracking-tight">{r.headline}</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.k} className="glass rounded-[18px] p-4">
            <p className="text-xs text-muted-foreground">{t.k}</p>
            <p className="gradient-text mt-1 font-display text-2xl font-semibold tracking-[-0.03em]">{t.v}</p>
            {t.sub ? <p className="text-[11px] text-[#5f6f92]">{t.sub}</p> : null}
          </div>
        ))}
      </div>
      {r.metrics.best || r.metrics.worst ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {r.metrics.best ? <div className="rounded-2xl border border-[rgba(60,220,160,0.25)] bg-[rgba(60,220,160,0.06)] p-4"><p className="kicker mb-1">Best ad</p><p className="font-display font-semibold">{r.metrics.best.adName}</p><p className="text-sm text-[#c2d1ef]">{r.metrics.best.results} results at {usd(r.metrics.best.cpr)} each</p></div> : null}
          {r.metrics.worst ? <div className="rounded-2xl border border-[var(--line)] bg-[rgba(12,22,46,0.35)] p-4"><p className="kicker mb-1">Weakest ad</p><p className="font-display font-semibold">{r.metrics.worst.adName}</p><p className="text-sm text-[#c2d1ef]">{r.metrics.worst.results} results · {usd(r.metrics.worst.spend)} spent</p></div> : null}
        </div>
      ) : null}
      <List title="What happened" items={r.whatHappened} />
      <List title="What worked" items={r.whatWorked} />
      <List title={r.type === "weekly" ? "What changes this week" : "Next month's plan"} items={r.whatChanges} />
      {r.upsell ? <section><p className="kicker mb-2">Next step</p><p className="text-[#c2d1ef]">{r.upsell}</p></section> : null}
    </div>
  );
}
