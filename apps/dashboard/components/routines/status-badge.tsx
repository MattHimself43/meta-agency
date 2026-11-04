import { Badge } from "@/components/ui/badge";

export function RunStatusBadge({ status }: { status: string | null }) {
  if (!status) return <Badge variant="muted">never run</Badge>;
  const variant = status === "succeeded" ? "low" : status === "failed" ? "high" : status === "running" ? "default" : "muted";
  return <Badge variant={variant}>{status}</Badge>;
}
