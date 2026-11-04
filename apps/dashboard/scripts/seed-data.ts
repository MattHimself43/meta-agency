/**
 * Seed data. Everything under DEMO_* is fake and flagged is_demo = true.
 * Business names are invented; phone numbers use the NANP fictional range 555-01xx.
 */

export const NICHES = [
  {
    slug: "car_dealers",
    name: "Car dealers (foreign-used & new)",
    scoringRules: [
      { key: "ad_activity", label: "Runs Meta ads, but basic (boosted posts, no lead forms)", weight: 3 },
      { key: "inventory_size", label: "Inventory size (20+ units on lot/page)", weight: 2 },
      { key: "posting_frequency", label: "Posts stock at least weekly", weight: 2 },
      { key: "engagement", label: "Comments / 'price pls' engagement on posts", weight: 2 },
      { key: "reviews", label: "Google reviews (count and rating)", weight: 1 },
    ],
    kpiTargets: {
      cost_per_whatsapp_chat: { ttd_cents: 4000, usd_cents: 588, label: "Cost per WhatsApp chat" },
      cost_per_lead: { ttd_cents: 10000, usd_cents: 1471, label: "Cost per finance lead" },
      ctr_min_pct: 1.2,
      frequency_max: 3,
    },
    intakeSchema: [
      { key: "stock_list", label: "Stock list (file or link)", type: "file_or_url", required: true },
      { key: "price_range", label: "Typical price range (TT$)", type: "text", required: true },
      { key: "financing_partners", label: "Financing partners and terms", type: "textarea", required: true, hint: "e.g. bank, credit union, in-house — rates, terms, minimum deposit" },
      { key: "deposit_offers", label: "Deposit offers", type: "textarea", required: false, hint: "Only offers you can honour, e.g. '$20k down, drive today'" },
      { key: "best_sellers", label: "Best-selling models", type: "text", required: true },
      { key: "locations", label: "Lot locations", type: "textarea", required: true },
      { key: "opening_hours", label: "Opening hours", type: "text", required: true },
      { key: "lead_whatsapp", label: "WhatsApp number for leads", type: "phone", required: true },
    ],
    campaignTemplates: [
      { key: "ctwa", name: "Click-to-WhatsApp", objective: "OUTCOME_ENGAGEMENT", destination: "WHATSAPP", specialAdCategory: null },
      { key: "finance_lead_form", name: "Finance offer lead form", objective: "OUTCOME_LEADS", destination: "ON_AD", specialAdCategory: "FINANCIAL_PRODUCTS_SERVICES", note: "Credit/finance offers may fall under Meta's Financial products and services category — confirm against current policy." },
      { key: "stock_showcase", name: "Stock showcase", objective: "OUTCOME_ENGAGEMENT", destination: "WHATSAPP", specialAdCategory: null },
      { key: "engager_retargeting", name: "Engager retargeting", objective: "OUTCOME_ENGAGEMENT", destination: "WHATSAPP", specialAdCategory: null },
    ],
  },
  {
    slug: "real_estate",
    name: "Real estate agents & developers",
    scoringRules: [
      { key: "ad_activity", label: "Runs Meta ads, but basic", weight: 3 },
      { key: "inventory_size", label: "Active listings (10+)", weight: 2 },
      { key: "posting_frequency", label: "Posts listings at least weekly", weight: 2 },
      { key: "engagement", label: "Engagement on listing posts", weight: 2 },
      { key: "reviews", label: "Google reviews", weight: 1 },
    ],
    kpiTargets: {
      cost_per_lead: { ttd_cents: 12000, usd_cents: 1765, label: "Cost per seller/buyer lead" },
      cost_per_whatsapp_chat: { ttd_cents: 5000, usd_cents: 735, label: "Cost per WhatsApp chat" },
      ctr_min_pct: 1.0,
      frequency_max: 3,
    },
    intakeSchema: [
      { key: "listings", label: "Current listings (file or link)", type: "file_or_url", required: true },
      { key: "price_bands", label: "Price bands (TT$)", type: "text", required: true },
      { key: "areas", label: "Areas you cover", type: "textarea", required: true },
      { key: "focus", label: "Focus", type: "select", options: ["buy", "sell", "rent", "mixed"], required: true },
      { key: "lead_contact", label: "Who receives leads (name + WhatsApp)", type: "text", required: true },
    ],
    campaignTemplates: [
      { key: "seller_valuation", name: "Seller valuation lead form", objective: "OUTCOME_LEADS", destination: "ON_AD", specialAdCategory: "HOUSING", note: "Housing special ad category likely applies — restricted targeting." },
      { key: "listing_promotion", name: "Listing promotion", objective: "OUTCOME_ENGAGEMENT", destination: "WHATSAPP", specialAdCategory: "HOUSING" },
      { key: "buyer_retargeting", name: "Buyer retargeting", objective: "OUTCOME_ENGAGEMENT", destination: "WHATSAPP", specialAdCategory: "HOUSING" },
    ],
  },
] as const;

/** Message templates. {{placeholders}} are filled by the AI with real facts only. */
export const TEMPLATES: { niche: string; key: string; name: string; channel: "whatsapp" | "email" | "dm"; purpose: string; body: string }[] = [
  {
    niche: "car_dealers",
    key: "dealer_opener_specific",
    name: "Opener — specific car",
    channel: "whatsapp",
    purpose: "opener",
    body: "Hi {{contact_first_name}}, Matthias here. Saw the {{specific_vehicle}} on your page — nice unit. I run Facebook/Instagram ads for car dealers in T&T that bring buyers straight to WhatsApp. Mind if I send a quick idea for your page? No pressure.",
  },
  {
    niche: "car_dealers",
    key: "dealer_opener_gap",
    name: "Opener — ad gap",
    channel: "whatsapp",
    purpose: "opener",
    body: "Hi {{contact_first_name}}, Matthias here. I noticed {{business_name}} {{ad_gap_observation}}. I help dealers here turn that into WhatsApp chats from serious buyers. Can I send you a 1-page idea? Free, no strings.",
  },
  {
    niche: "car_dealers",
    key: "dealer_followup_day3",
    name: "Follow-up day 3",
    channel: "whatsapp",
    purpose: "followup_day3",
    body: "Hi {{contact_first_name}}, just following up on my message. Happy to send that quick ad idea for {{business_name}} whenever suits — takes 2 minutes to read.",
  },
  {
    niche: "car_dealers",
    key: "dealer_followup_day7",
    name: "Last nudge day 7",
    channel: "whatsapp",
    purpose: "followup_day7",
    body: "Hi {{contact_first_name}}, last one from me! If ads aren't a priority right now, no problem at all. If that changes, I'm here. All the best with the lot.",
  },
  {
    niche: "real_estate",
    key: "re_opener_listing",
    name: "Opener — specific listing",
    channel: "whatsapp",
    purpose: "opener",
    body: "Hi {{contact_first_name}}, Matthias here. Saw your {{specific_listing}} listing — lovely property. I run Facebook/Instagram ads for agents in T&T that bring in seller and buyer enquiries. Could I send a quick idea? No pressure.",
  },
  {
    niche: "real_estate",
    key: "re_followup_day3",
    name: "Follow-up day 3",
    channel: "whatsapp",
    purpose: "followup_day3",
    body: "Hi {{contact_first_name}}, following up on my note. Happy to share a short idea for getting more 'What's my home worth?' enquiries in {{area}}.",
  },
  {
    niche: "real_estate",
    key: "re_followup_day7",
    name: "Last nudge day 7",
    channel: "whatsapp",
    purpose: "followup_day7",
    body: "Hi {{contact_first_name}}, last message from me. If it's not the right time, all good — wishing you plenty closings!",
  },
];

/** Prices in TTD cents. */
export const PACKAGES = [
  {
    slug: "starter",
    name: "Starter",
    recommended: false,
    setupFeeCents: 150000,
    monthlyFeeCents: 250000,
    includes: ["1 campaign", "Up to 6 ads/month", "Weekly report", "Click-to-WhatsApp or lead form"],
    recommendedSpend: "US$300–500/month",
    sortOrder: 1,
  },
  {
    slug: "growth",
    name: "Growth",
    recommended: true,
    setupFeeCents: 150000,
    monthlyFeeCents: 400000,
    includes: ["Up to 3 campaigns incl. retargeting", "Up to 12 ads/month incl. video", "Weekly report + monthly review", "Fortnightly creative refresh"],
    recommendedSpend: "US$500–1,500/month",
    sortOrder: 2,
  },
  {
    slug: "dominate",
    name: "Dominate",
    recommended: false,
    setupFeeCents: 250000,
    monthlyFeeCents: 650000,
    includes: ["Unlimited campaigns", "Up to 20 ads/month", "Inventory-to-ad", "Monthly strategy call", "Priority WhatsApp support"],
    recommendedSpend: "US$1,500+/month",
    sortOrder: 3,
  },
];

export const PACKAGE_TERMS = "3-month minimum, then month to month with 30 days' notice. Ad spend is paid by the client directly to Meta and is not included.";

const L = (n: number) => `00000000-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
const C = (n: number) => `00000000-0000-4000-8000-0000000002${String(n).padStart(2, "0")}`;
export const DEMO_IDS = { lead: L, client: C };

type DemoLead = {
  id: string;
  niche: "car_dealers" | "real_estate";
  businessName: string;
  area: string;
  contactName: string;
  phone: string;
  facebookUrl: string;
  instagramUrl?: string;
  website?: string;
  runsMetaAds: boolean;
  adCount: number;
  adNotes: string;
  fitScore: number;
  scoreReasons: string[];
  stage: "new" | "contacted" | "replied" | "call_booked" | "proposal_sent" | "won" | "lost" | "nurture";
  estimatedValueCents: number;
  source: string;
};

export const DEMO_LEADS: DemoLead[] = [
  { id: L(1), niche: "car_dealers", businessName: "Demo — Caroni Plains Auto (fictional)", area: "Chaguanas", contactName: "Ravi Demo", phone: "+18685550101", facebookUrl: "https://facebook.com/demo-caroni-plains-auto", runsMetaAds: true, adCount: 3, adNotes: "Boosted posts only, no WhatsApp button, same photo reused.", fitScore: 9, scoreReasons: ["Runs basic boosted posts", "~40 units on page", "Posts daily", "Lots of 'price pls' comments"], stage: "new", estimatedValueCents: 400000, source: "demo" },
  { id: L(2), niche: "car_dealers", businessName: "Demo — Northern Range Motors (fictional)", area: "Arima", contactName: "Keisha Demo", phone: "+18685550102", facebookUrl: "https://facebook.com/demo-northern-range-motors", runsMetaAds: false, adCount: 0, adNotes: "No ads in Ad Library; active organic page.", fitScore: 7, scoreReasons: ["No ads yet", "~25 units", "Posts 3x/week"], stage: "new", estimatedValueCents: 250000, source: "demo" },
  { id: L(3), niche: "car_dealers", businessName: "Demo — Gulf View Foreign Used (fictional)", area: "San Fernando", contactName: "Marlon Demo", phone: "+18685550103", facebookUrl: "https://facebook.com/demo-gulf-view-foreign-used", runsMetaAds: true, adCount: 6, adNotes: "Running 6 ads for 4+ months, all 'Send message', no offer.", fitScore: 8, scoreReasons: ["Consistent but basic ads", "Large lot", "Good reviews"], stage: "contacted", estimatedValueCents: 400000, source: "demo" },
  { id: L(4), niche: "car_dealers", businessName: "Demo — Savannah Auto Imports (fictional)", area: "Port of Spain", contactName: "Andre Demo", phone: "+18685550104", facebookUrl: "https://facebook.com/demo-savannah-auto-imports", runsMetaAds: true, adCount: 2, adNotes: "Two finance-offer image ads, no lead form.", fitScore: 8, scoreReasons: ["Finance offers", "Weekly posts"], stage: "replied", estimatedValueCents: 400000, source: "demo" },
  { id: L(5), niche: "car_dealers", businessName: "Demo — Couva Car Mart (fictional)", area: "Couva", contactName: "Shaliza Demo", phone: "+18685550105", facebookUrl: "https://facebook.com/demo-couva-car-mart", runsMetaAds: false, adCount: 0, adNotes: "Small page, irregular posts.", fitScore: 5, scoreReasons: ["Small inventory", "Low posting"], stage: "nurture", estimatedValueCents: 250000, source: "demo" },
  { id: L(6), niche: "car_dealers", businessName: "Demo — Tobago Wheels (fictional)", area: "Scarborough", contactName: "Jason Demo", phone: "+18685550106", facebookUrl: "https://facebook.com/demo-tobago-wheels", runsMetaAds: true, adCount: 1, adNotes: "One boosted post.", fitScore: 6, scoreReasons: ["Basic ad", "Tobago market"], stage: "call_booked", estimatedValueCents: 250000, source: "demo" },
  { id: L(7), niche: "real_estate", businessName: "Demo — Maraval Homes Realty (fictional)", area: "Maraval", contactName: "Natalie Demo", phone: "+18685550107", facebookUrl: "https://facebook.com/demo-maraval-homes", website: "https://example.com/maraval-homes", runsMetaAds: true, adCount: 4, adNotes: "Listing posts boosted; no seller valuation funnel.", fitScore: 8, scoreReasons: ["~30 listings", "Boosted listings only"], stage: "proposal_sent", estimatedValueCents: 400000, source: "demo" },
  { id: L(8), niche: "real_estate", businessName: "Demo — Central Lands Developers (fictional)", area: "Chaguanas", contactName: "Rajiv Demo", phone: "+18685550108", facebookUrl: "https://facebook.com/demo-central-lands", runsMetaAds: false, adCount: 0, adNotes: "New housing development, no ads yet.", fitScore: 7, scoreReasons: ["New development launch", "No ads"], stage: "new", estimatedValueCents: 650000, source: "demo" },
  { id: L(9), niche: "real_estate", businessName: "Demo — Diego Martin Property Co. (fictional)", area: "Diego Martin", contactName: "Simone Demo", phone: "+18685550109", facebookUrl: "https://facebook.com/demo-dm-property", runsMetaAds: true, adCount: 2, adNotes: "Rental listings ads.", fitScore: 6, scoreReasons: ["Rental focus", "Some ads"], stage: "new", estimatedValueCents: 250000, source: "demo" },
  { id: L(10), niche: "real_estate", businessName: "Demo — Westmoorings Realty (fictional)", area: "Westmoorings", contactName: "Kevin Demo", phone: "+18685550110", facebookUrl: "https://facebook.com/demo-westmoorings-realty", runsMetaAds: false, adCount: 0, adNotes: "Luxury listings, organic only.", fitScore: 7, scoreReasons: ["High-value listings", "No ads"], stage: "lost", estimatedValueCents: 400000, source: "demo" },
];

export const DEMO_CLIENTS = [
  {
    id: C(1),
    niche: "car_dealers" as const,
    name: "Demo — Princes Town Auto Hub (fictional)",
    contactName: "Darren Demo",
    whatsapp: "+18685550121",
    packageSlug: "growth",
    status: "active" as const,
    startDate: "2026-09-01",
    contractEnd: "2026-12-01",
    adAccountId: "act_000000000000001",
    monthlyBudgetUsdCents: 80000,
    healthScore: 82,
  },
  {
    id: C(2),
    niche: "real_estate" as const,
    name: "Demo — St. Augustine Realty Group (fictional)",
    contactName: "Alicia Demo",
    whatsapp: "+18685550122",
    packageSlug: "starter",
    status: "onboarding" as const,
    startDate: "2026-11-01",
    contractEnd: "2027-02-01",
    adAccountId: null,
    monthlyBudgetUsdCents: 40000,
    healthScore: null,
  },
];

export const ONBOARDING_STEPS = [
  { stepKey: "agreement", label: "Sign the agreement", ownerOnly: false },
  { stepKey: "intake", label: "Intake form", ownerOnly: false },
  { stepKey: "assets", label: "Upload photos, videos, logo, brand colours", ownerOnly: false },
  { stepKey: "meta_access", label: "Give Meta partner access + add card to ad account", ownerOnly: false },
  { stepKey: "access_check", label: "Agency access verified (Page, ad account, pixel)", ownerOnly: true },
  { stepKey: "spending_limit", label: "Account spending limit set in Meta", ownerOnly: true },
];
