export function PageHeader({ title, description, actions, kicker }: { title: string; description?: string; actions?: React.ReactNode; kicker?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        {kicker ? <p className="kicker mb-2">{kicker}</p> : null}
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] sm:text-[32px]">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function ComingSoon({ phase, children }: { phase: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-dashed border-[var(--line-strong)] bg-[rgba(12,22,46,0.35)] p-4 text-sm text-muted-foreground">
      <span className="shrink-0 rounded-full border border-[var(--line-strong)] bg-[rgba(46,107,255,0.12)] px-2 py-0.5 font-display text-[10px] font-medium uppercase tracking-[0.14em] text-[#bcd3ff]">
        {phase}
      </span>
      <span>{children}</span>
    </div>
  );
}

/** Success / error notice in the landing palette. */
export function Notice({ tone = "success", children }: { tone?: "success" | "error"; children: React.ReactNode }) {
  return (
    <p
      className={
        tone === "success"
          ? "mb-4 rounded-xl border border-[rgba(60,220,160,0.25)] bg-[rgba(60,220,160,0.08)] px-3 py-2 text-sm text-[#7cf5c4]"
          : "mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-300"
      }
    >
      {children}
    </p>
  );
}

/** Section label inside forms — the landing kicker. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="kicker pt-3">{children}</p>;
}
