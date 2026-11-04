/** Tables offered in Settings → Export. Integrations are excluded (encrypted tokens never leave the server). */
export const EXPORTABLE_TABLES = [
  "settings", "niches", "message_templates", "packages", "leads", "activities", "bookings", "sequences", "sequence_steps",
  "messages", "audits", "call_briefs", "proposals", "clients", "onboarding_steps", "agreements", "assets", "campaign_plans",
  "creatives", "performance_daily", "recommendations", "reports", "invoices", "invoice_lines", "payments", "expenses",
  "approvals", "routines", "routine_runs", "jobs", "audit_log", "ai_usage", "alerts", "time_entries", "profiles",
] as const;

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    if (v == null) return "";
    const s = v instanceof Date ? v.toISOString() : typeof v === "object" ? JSON.stringify(v) : String(v);
    // Quote, and neutralise spreadsheet formula injection.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
}
