import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { formatAst } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import type { BriefEntry } from "@/lib/performance/service";

const usd = (c: number | null | undefined) => (c == null ? "—" : `US$${(c / 100).toFixed(2)}`);
const TONE = { problem: "high", watch: "medium", good: "low", no_data: "muted" } as const;

/** Latest 07:00 morning check: per client yesterday vs target, red flags first. */
export async function MorningBrief() {
  const [routine] = await db.select().from(schema.routines).where(eq(schema.routines.key, "morning_check"));
  const [run] = routine ? await db.select().from(schema.routineRuns).where(eq(schema.routineRuns.routineId, routine.id)).orderBy(desc(schema.routineRuns.startedAt)).limit(1) : [];
  const brief = (run?.output as { brief?: BriefEntry[] } | undefined)?.brief;
  if (!run || !brief) return <p className="text-sm text-muted-foreground">No morning check yet. It runs at 07:00 — or press Run now on Routines → Morning account check.</p>;
  if (!brief.length) return <p className="text-sm text-muted-foreground">No clients with results yet. Import an Ads Manager CSV on a client&apos;s Performance tab.</p>;
  return (
    <div>
      <p className="mb-2 text-[11px] text-[#5f6f92]">{formatAst(run.startedAt, "EEE d MMM, h:mm a")} · yesterday&apos;s numbers</p>
      <ul className="divide-y divide-[var(--line)]">
        {brief.map((b) => (
          <li key={b.clientId} className="py-2.5">
            <div className="flex items-center gap-2">
              <Link href={`/dashboard/clients/${b.clientId}?tab=performance`} className="flex-1 truncate text-sm font-medium hover:text-brand-cyan">{b.clientName}</Link>
              <Badge variant={TONE[b.snapshot.status]}>{b.snapshot.status.replace("_", " ")}</Badge>
            </div>
            <p className="text-xs text-[#c2d1ef]">
              {usd(b.snapshot.yesterday.spend)} · {b.snapshot.yesterday.results} results · {usd(b.snapshot.yesterday.cpr)} each{b.snapshot.targetCpr ? ` (target ${usd(b.snapshot.targetCpr)})` : ""}
            </p>
            {b.snapshot.flags.slice(0, 2).map((f) => <p key={f} className="text-xs text-amber-200">⚑ {f}</p>)}
          </li>
        ))}
      </ul>
    </div>
  );
}
