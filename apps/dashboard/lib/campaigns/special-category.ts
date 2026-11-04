/**
 * Meta "special ad categories" restrict targeting for credit/financial and housing ads. Flag plans that may fall
 * under them and apply the restricted rules in the plan. Meta's policy changes — always confirm in Ads Manager.
 */
export type SpecialCategory = "FINANCIAL_PRODUCTS_SERVICES" | "HOUSING" | null;

const FINANCE = /\b(financ\w*|loans?|credit|hire[- ]purchase|deposits?|down ?payments?|monthly payments?|interest|apr)\b|\$\s?\d+\s?k?\s+down\b/i;
const HOUSING = /\b(houses?|homes?|apartments?|condos?|townhouses?|property|properties|real estate|rent(al|als)?|lease|listings?|land)\b/i;

export function detectSpecialCategory(input: { templateCategory?: string | null; nicheSlug?: string | null; texts: string[] }): { category: SpecialCategory; reasons: string[] } {
  const reasons: string[] = [];
  const text = input.texts.join(" ");
  if (input.templateCategory === "HOUSING" || input.nicheSlug === "real_estate") {
    if (input.templateCategory === "HOUSING") reasons.push("The campaign template is tagged Housing");
    if (input.nicheSlug === "real_estate") reasons.push("Real estate client");
    if (HOUSING.test(text)) reasons.push("Ad copy mentions property, homes or rentals");
    return { category: "HOUSING", reasons };
  }
  if (input.templateCategory === "FINANCIAL_PRODUCTS_SERVICES" || FINANCE.test(text)) {
    if (input.templateCategory === "FINANCIAL_PRODUCTS_SERVICES") reasons.push("The campaign template is tagged Financial products and services");
    if (FINANCE.test(text)) reasons.push("Ad copy mentions financing, deposits, loans or rates");
    return { category: "FINANCIAL_PRODUCTS_SERVICES", reasons };
  }
  return { category: null, reasons };
}

export const RESTRICTED_RULES = [
  "Age must be 18–65+ (no narrowing by age)",
  "No gender targeting",
  "Location: no postcode targeting; target areas with at least a 15-mile (about 25 km) radius",
  "Detailed targeting is limited — many interests are unavailable",
  "Lookalike audiences become special ad audiences",
];

export const CATEGORY_LABEL: Record<Exclude<SpecialCategory, null>, string> = {
  FINANCIAL_PRODUCTS_SERVICES: "Financial products and services (credit)",
  HOUSING: "Housing",
};
