import "server-only";
import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { format, startOfMonth, startOfWeek } from "date-fns";
import { db, schema } from "@/lib/db";
import { astToUtc, utcToAst } from "@/lib/time";
import { sortQueue } from "@/lib/approvals/types";

const count = sql<number>`count(*)::int`;

/** Start of the current AST week (Monday 00:00) / month as UTC instants. */
function astPeriodStarts(now = new Date()) {
  const local = utcToAst(now);
  const week = startOfWeek(local, { weekStartsOn: 1 });
  const month = startOfMonth(local);
  // toZonedTime() returns a Date whose *local* fields are the AST wall clock, so format with local fields.
  const asWall = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm:ss");
  return { weekStart: astToUtc(asWall(week)), monthStart: astToUtc(asWall(month)), monthStartDate: format(month, "yyyy-MM-dd") };
}

export async function getKpis() {
  const { weekStart, monthStartDate } = astPeriodStarts();
  const [[active], [mrr], [pipeline], [sent], [replies], [spend], [overdue]] = await Promise.all([
    db.select({ n: count }).from(schema.clients).where(eq(schema.clients.status, "active")),
    db
      .select({ cents: sql<number>`coalesce(sum(${schema.packages.monthlyFeeCents}),0)::bigint` })
      .from(schema.clients)
      .innerJoin(schema.packages, eq(schema.packages.id, schema.clients.packageId))
      .where(eq(schema.clients.status, "active")),
    db
      .select({ cents: sql<number>`coalesce(sum(${schema.leads.estimatedValueCents}),0)::bigint` })
      .from(schema.leads)
      .where(inArray(schema.leads.stage, ["contacted", "replied", "call_booked", "proposal_sent"])),
    db.select({ n: count }).from(schema.activities).where(and(eq(schema.activities.type, "message_sent"), gte(schema.activities.occurredAt, weekStart))),
    db.select({ n: count }).from(schema.activities).where(and(eq(schema.activities.type, "reply"), gte(schema.activities.occurredAt, weekStart))),
    db
      .select({ cents: sql<number>`coalesce(sum(${schema.performanceDaily.spendUsdCents}),0)::bigint` })
      .from(schema.performanceDaily)
      .where(gte(schema.performanceDaily.date, monthStartDate)),
    db.select({ n: count }).from(schema.invoices).where(eq(schema.invoices.status, "overdue")),
  ]);
  const sentN = sent?.n ?? 0;
  return {
    activeClients: active?.n ?? 0,
    mrrTtdCents: Number(mrr?.cents ?? 0),
    pipelineTtdCents: Number(pipeline?.cents ?? 0),
    contactedThisWeek: sentN,
    replyRate: sentN ? Math.round(((replies?.n ?? 0) / sentN) * 100) : null,
    spendMtdUsdCents: Number(spend?.cents ?? 0),
    overdueInvoices: overdue?.n ?? 0,
  };
}

export async function getPendingApprovals(limit = 50) {
  const rows = await db
    .select()
    .from(schema.approvals)
    .where(eq(schema.approvals.status, "pending"))
    .orderBy(desc(schema.approvals.createdAt))
    .limit(limit);
  return sortQueue(rows);
}

export async function getOpenAlerts() {
  return db.select().from(schema.alerts).where(isNull(schema.alerts.resolvedAt)).orderBy(desc(schema.alerts.createdAt)).limit(20);
}
