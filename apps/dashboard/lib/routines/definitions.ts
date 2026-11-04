/** Seeded routines. Times are America/Port_of_Spain (AST). `phase` = when the handler is built. */
export type RoutineDefinition = {
  key: string;
  name: string;
  description: string;
  cron: string;
  everyNWeeks?: number;
  anchorDate?: string;
  phase: 0 | 1 | 2 | 3;
  enabledByDefault: boolean;
};

export const ROUTINE_DEFINITIONS: RoutineDefinition[] = [
  {
    key: "system_test",
    name: "System test",
    description: "Proves the scheduler works: runs daily at 12:00 AST and puts one low-risk test item in the approval queue.",
    cron: "0 12 * * *",
    phase: 0,
    enabledByDefault: true,
  },
  {
    key: "daily_digest",
    name: "Daily digest email",
    description: "Emails the morning summary: pending approvals, alerts and every routine's digest line from the last 24 hours.",
    cron: "15 7 * * *",
    phase: 0,
    enabledByDefault: true,
  },
  {
    key: "morning_check",
    name: "Morning account check",
    description: "Pull/import yesterday's results, flag problems, draft recommendations, write the morning brief.",
    cron: "0 7 * * *",
    phase: 2,
    enabledByDefault: true,
  },
  {
    key: "outreach_batch",
    name: "Outreach batch",
    description: "Pick the 10 highest-scored uncontacted leads, draft openers and due follow-ups.",
    cron: "0 8 * * 1-5",
    phase: 1,
    enabledByDefault: true,
  },
  {
    key: "lead_refresh",
    name: "Lead refresh",
    description: "Research ~25 new leads, rescore, recheck who started running ads.",
    cron: "0 6 * * 1",
    phase: 1,
    enabledByDefault: true,
  },
  {
    key: "weekly_reports",
    name: "Weekly reports",
    description: "One report per active client.",
    cron: "0 9 * * 1",
    phase: 2,
    enabledByDefault: true,
  },
  {
    key: "creative_refresh",
    name: "Creative refresh",
    description: "New hooks and variants for fatigued ads (every 2nd Wednesday).",
    cron: "0 9 * * 3",
    everyNWeeks: 2,
    anchorDate: "2026-11-04",
    phase: 2,
    enabledByDefault: true,
  },
  {
    key: "month_end_close",
    name: "Month-end close",
    description: "Monthly reviews, invoices, renewal and upsell notes.",
    cron: "0 8 1 * *",
    phase: 2,
    enabledByDefault: true,
  },
  {
    key: "onboarding_chaser",
    name: "Onboarding chaser",
    description: "Nudges for onboarding steps stuck 2+ days.",
    cron: "0 10 * * *",
    phase: 2,
    enabledByDefault: true,
  },
  {
    key: "invoice_chaser",
    name: "Overdue invoice chaser",
    description: "Reminder drafts for overdue invoices (3, 10 and 21 days).",
    cron: "0 11 * * *",
    phase: 2,
    enabledByDefault: true,
  },
  {
    key: "weekly_review",
    name: "Weekly agency review",
    description: "Pipeline, revenue, reply rates, hours.",
    cron: "0 16 * * 5",
    phase: 2,
    enabledByDefault: true,
  },
  {
    key: "inbox_sync",
    name: "Inbox sync",
    description: "Every 30 minutes, 7am–9pm: Gmail replies from leads become logged replies (sequence stops, response drafted for approval); new Meta instant-form leads land in each client's lead inbox. Does nothing while Gmail and the Meta API are off.",
    cron: "*/30 7-21 * * *",
    phase: 3,
    enabledByDefault: true,
  },
];

export const ROUTINE_PHASE: Record<string, number> = Object.fromEntries(ROUTINE_DEFINITIONS.map((d) => [d.key, d.phase]));
