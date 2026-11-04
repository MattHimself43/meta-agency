import { Check, Pencil, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { APPROVAL_TYPES, isApprovalType, roleCanApprove, type Risk } from "@/lib/approvals/types";
import { formatAst } from "@/lib/time";
import { approveAction, editApprovalAction, rejectAction } from "@/app/(dashboard)/dashboard/actions";
import type { Approval } from "@/lib/approvals";

export function ApprovalList({ items, role, empty = "Nothing waiting. Nice." }: { items: Approval[]; role: "owner" | "account_manager" | "none"; empty?: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y divide-[var(--line)]">
      {items.map((a) => {
        const label = isApprovalType(a.itemType) ? APPROVAL_TYPES[a.itemType].label : a.itemType;
        const body = typeof a.preview?.body === "string" ? a.preview.body : null;
        const allowed = a.status === "pending" && roleCanApprove(role, a.itemType, a.riskLevel as Risk);
        return (
          <li key={a.id} className="py-4 first:pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={a.riskLevel}>{a.riskLevel} risk</Badge>
              <Badge variant="muted">{label}</Badge>
              {a.status !== "pending" ? <Badge variant="outline">{a.status.replace("_", " ")}</Badge> : null}
              <span className="ml-auto text-xs text-[#5f6f92]">{formatAst(a.createdAt)}</span>
            </div>
            <p className="mt-2 font-display text-[15px] font-semibold tracking-tight">{a.title}</p>
            {a.summary ? <p className="text-sm text-muted-foreground">{a.summary}</p> : null}
            {body ? <blockquote className="mt-2.5 whitespace-pre-wrap rounded-2xl border border-[var(--line)] border-l-2 border-l-brand-cyan bg-[rgba(8,16,31,0.55)] p-3.5 text-sm leading-relaxed text-[#c2d1ef] shadow-[inset_8px_0_24px_-20px_rgba(95,227,255,0.8)]">{body}</blockquote> : null}
            {a.decisionNote && a.status !== "pending" ? <p className="mt-1 text-xs text-muted-foreground">Note: {a.decisionNote}</p> : null}

            {allowed ? (
              <div className="mt-3 flex flex-wrap items-start gap-2">
                <form action={approveAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <Button size="sm" type="submit">
                    <Check /> Approve
                  </Button>
                </form>
                <form action={rejectAction}>
                  <input type="hidden" name="id" value={a.id} />
                  <Button size="sm" variant="outline" type="submit">
                    <X /> Reject
                  </Button>
                </form>
                {body !== null ? (
                  <details className="w-full sm:w-auto sm:flex-1">
                    <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-2 rounded-full px-4 text-sm font-semibold text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground [&::-webkit-details-marker]:hidden">
                      <Pencil className="h-4 w-4" /> Edit
                    </summary>
                    <form action={editApprovalAction} className="mt-2 space-y-2">
                      <input type="hidden" name="id" value={a.id} />
                      <Textarea name="body" defaultValue={body} rows={4} />
                      <Button size="sm" type="submit" variant="secondary">
                        Save edit
                      </Button>
                    </form>
                  </details>
                ) : null}
              </div>
            ) : a.status === "pending" ? (
              <p className="mt-2 text-xs text-[#5f6f92]">Needs the owner.</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
