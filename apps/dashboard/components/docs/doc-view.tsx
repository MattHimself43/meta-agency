import { SECTIONS, type DocKind } from "@/lib/docs/sections";
import { formatMoney } from "@/lib/money";

type Pkg = { name: string; setupFeeCents: number; monthlyFeeCents: number; includes: string[]; recommendedSpend: string | null; terms: string | null } | null;
type Rec = Record<string, unknown>;

/** Read-only document body — the same markup on the dashboard and on the public share page. */
export function DocView({ kind, content, pkg, setupWaived }: { kind: DocKind; content: Rec; pkg?: Pkg; setupWaived?: boolean }) {
  const sections = SECTIONS[kind].filter((s) => !["headline", "title", "package_slug", "suggested_package_slug"].includes(s.key));
  return (
    <div className="space-y-6">
      {sections.map((s) => {
        const v = content[s.key];
        if (v == null || (Array.isArray(v) && v.length === 0) || v === "") return null;
        return (
          <section key={s.key}>
            <p className="kicker mb-2">{s.title}</p>
            {s.type === "text" ? <p className="whitespace-pre-wrap leading-relaxed text-[#c2d1ef]">{String(v)}</p> : null}
            {s.type === "list" ? (
              <ul className="space-y-1.5">{(v as string[]).map((x, i) => <li key={i} className="flex gap-2.5 text-[#c2d1ef]"><span className="glow-dot mt-2 shrink-0" />{x}</li>)}</ul>
            ) : null}
            {s.type === "pairs" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {(v as Rec[]).map((p, i) => (
                  <div key={i} className="rounded-2xl border border-[var(--line)] bg-[rgba(12,22,46,0.35)] p-4">
                    <p className="font-display font-semibold">{String(p[s.a] ?? "")}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[#c2d1ef]">{String(p[s.b] ?? "")}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {s.type === "object" ? (
              <div className="glass-strong rounded-[22px] p-5">
                {s.fields.map((f) => (v as Rec)[f.key] ? (
                  <p key={f.key} className="mb-2 text-sm"><span className="text-[#5f6f92]">{f.label}: </span><span className="text-foreground">{String((v as Rec)[f.key])}</span></p>
                ) : null)}
              </div>
            ) : null}
          </section>
        );
      })}
      {kind === "proposal" && pkg ? (
        <section>
          <p className="kicker mb-2">Package &amp; investment</p>
          <div className="glass-strong rounded-[22px] p-5">
            <p className="font-display text-xl font-semibold">{pkg.name}</p>
            <p className="mt-1 gradient-text font-display text-2xl font-semibold">{formatMoney(pkg.monthlyFeeCents, "TTD", { decimals: false })}/month</p>
            <p className="text-sm text-[#c2d1ef]">Setup: {setupWaived ? <><s>{formatMoney(pkg.setupFeeCents, "TTD", { decimals: false })}</s> waived (founding client)</> : formatMoney(pkg.setupFeeCents, "TTD", { decimals: false })}</p>
            <ul className="mt-3 space-y-1">{pkg.includes.map((x) => <li key={x} className="flex gap-2.5 text-sm text-[#c2d1ef]"><span className="glow-dot mt-1.5 shrink-0" />{x}</li>)}</ul>
            {pkg.recommendedSpend ? <p className="mt-3 text-xs text-muted-foreground">Recommended ad spend (paid by you to Meta): {pkg.recommendedSpend}</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
