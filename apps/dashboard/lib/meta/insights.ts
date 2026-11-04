import type { PerfRow } from "@/lib/performance/ads-csv";

/** Pure: Marketing API insights rows (level=ad, time_increment=1) → performance rows. */
export type InsightRow = {
  date_start: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  inline_link_clicks?: string;
  clicks?: string;
  inline_link_click_ctr?: string;
  ctr?: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
};

const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "leadgen_grouped", "offsite_conversion.fb_pixel_lead"];
const CHAT_TYPES = ["onsite_conversion.messaging_conversation_started_7d"];

export const INSIGHT_FIELDS = "campaign_name,adset_name,ad_name,ad_id,spend,impressions,reach,frequency,inline_link_clicks,clicks,inline_link_click_ctr,ctr,actions,cost_per_action_type";

function sum(list: { action_type: string; value: string }[] | undefined, types: string[]) {
  // A lead can be reported under several action types; take the largest rather than double counting.
  const vals = (list ?? []).filter((a) => types.includes(a.action_type)).map((a) => Number(a.value) || 0);
  return vals.length ? Math.max(...vals) : 0;
}
const num = (v: string | undefined) => (v == null || v === "" ? null : Number(v));
const cents = (usd: string | undefined) => Math.round((Number(usd) || 0) * 100);

export function mapInsights(rows: InsightRow[]): PerfRow[] {
  return rows.map((r) => {
    const leads = sum(r.actions, LEAD_TYPES);
    const chats = sum(r.actions, CHAT_TYPES);
    const results = chats || leads;
    const spend = cents(r.spend);
    return {
      date: r.date_start,
      campaignName: r.campaign_name ?? null,
      adSetName: r.adset_name ?? null,
      adName: r.ad_name ?? null,
      spendUsdCents: spend,
      impressions: Number(r.impressions) || 0,
      reach: Number(r.reach) || 0,
      frequency: num(r.frequency),
      clicks: Number(r.inline_link_clicks ?? r.clicks) || 0,
      ctr: num(r.inline_link_click_ctr ?? r.ctr),
      leads,
      whatsappConversations: chats,
      costPerResultUsdCents: results ? Math.round(spend / results) : null,
    };
  });
}
