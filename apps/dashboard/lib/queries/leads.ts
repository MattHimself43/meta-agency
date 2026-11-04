import "server-only";
import { and, asc, desc, eq, gte, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema } from "@/lib/db";

export type LeadFilters = { q?: string; niche?: string; stage?: string; area?: string; minScore?: string; ads?: string; sort?: string };

const STAGES = ["new", "contacted", "replied", "call_booked", "proposal_sent", "won", "lost", "nurture"];

export async function listLeads(f: LeadFilters, limit = 300) {
  const conds: SQL[] = [];
  const score = sql`coalesce(${schema.leads.fitScoreOverride}, ${schema.leads.fitScore})`;
  if (f.q?.trim()) {
    const q = `%${f.q.trim()}%`;
    conds.push(or(ilike(schema.leads.businessName, q), ilike(schema.leads.contactName, q), ilike(schema.leads.phone, q), ilike(schema.leads.email, q))!);
  }
  if (f.niche && /^[0-9a-f-]{36}$/.test(f.niche)) conds.push(eq(schema.leads.nicheId, f.niche));
  if (f.stage && STAGES.includes(f.stage)) conds.push(sql`${schema.leads.stage} = ${f.stage}`);
  if (f.area?.trim()) conds.push(ilike(schema.leads.area, `%${f.area.trim()}%`));
  if (f.minScore && /^\d+$/.test(f.minScore)) conds.push(gte(score, Number(f.minScore)));
  if (f.ads === "yes") conds.push(eq(schema.leads.runsMetaAds, true));
  if (f.ads === "no") conds.push(sql`${schema.leads.runsMetaAds} is not true`);
  const order =
    f.sort === "name" ? [asc(schema.leads.businessName)] : f.sort === "recent" ? [desc(schema.leads.createdAt)] : f.sort === "due" ? [sql`${schema.leads.nextActionDue} asc nulls last`] : [sql`${score} desc nulls last`, asc(schema.leads.businessName)];
  return db
    .select({ lead: schema.leads, nicheName: schema.niches.name })
    .from(schema.leads)
    .leftJoin(schema.niches, eq(schema.niches.id, schema.leads.nicheId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(...order)
    .limit(limit);
}
