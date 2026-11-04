import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STAGE_STYLE: Record<string, string> = {
  new: "border-[var(--line-strong)] bg-[rgba(46,107,255,0.12)] text-[#bcd3ff]",
  contacted: "border-sky-300/25 bg-sky-400/10 text-sky-200",
  replied: "border-cyan-300/30 bg-cyan-400/10 text-cyan-200",
  call_booked: "border-violet-300/30 bg-violet-400/10 text-violet-200",
  proposal_sent: "border-amber-300/25 bg-amber-400/10 text-amber-200",
  won: "border-[rgba(60,220,160,0.25)] bg-[rgba(60,220,160,0.1)] text-[#7cf5c4]",
  lost: "border-red-400/30 bg-red-500/10 text-red-300",
  nurture: "border-[var(--line)] bg-white/[0.03] text-muted-foreground",
};
const STAGE_LABEL: Record<string, string> = {
  new: "New", contacted: "Contacted", replied: "Replied", call_booked: "Call booked", proposal_sent: "Proposal sent", won: "Won", lost: "Lost", nurture: "Nurture",
};

export function StageBadge({ stage }: { stage: string }) {
  return <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", STAGE_STYLE[stage])}>{STAGE_LABEL[stage] ?? stage}</span>;
}

export function ScoreBadge({ score, override }: { score: number | null; override?: number | null }) {
  const s = override ?? score;
  if (s == null) return <Badge variant="muted">—</Badge>;
  const tone = s >= 8 ? "low" : s >= 5 ? "medium" : "high";
  return (
    <Badge variant={tone} title={override != null ? `Overridden (computed ${score ?? "—"})` : "Computed fit score"}>
      {s}/10{override != null ? " ✎" : ""}
    </Badge>
  );
}
