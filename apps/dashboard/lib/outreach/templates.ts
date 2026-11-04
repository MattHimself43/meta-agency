import { firstName } from "@/lib/leads/normalize";

/**
 * Fill a message template from known lead facts only. Placeholders we can't fill are reported,
 * and the sentence is rewritten generically rather than guessing — used when no AI key is set.
 */
export type TemplateLead = {
  businessName: string;
  contactName: string | null;
  area: string | null;
  adNotes: string | null;
  facts: { fact: string }[];
};

const cleanBusiness = (n: string) => n.replace(/^Demo — /, "").replace(/\s*\(fictional\)$/, "");

export function fillTemplate(body: string, lead: TemplateLead): { text: string; missing: string[] } {
  const missing: string[] = [];
  const values: Record<string, string | null> = {
    contact_first_name: firstName(lead.contactName),
    business_name: cleanBusiness(lead.businessName),
    area: lead.area,
    specific_vehicle: lead.facts[0]?.fact ?? null,
    specific_listing: lead.facts[0]?.fact ?? null,
    ad_gap_observation: lead.adNotes ? `is running ads (${lowerFirst(lead.adNotes.replace(/\.$/, ""))})` : null,
  };
  let text = body.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => {
    const v = values[key];
    if (v) return v;
    missing.push(key);
    return `{{${key}}}`;
  });
  // Graceful generic wording for the common gaps.
  text = text
    .replace(/^Hi \{\{contact_first_name\}\},/, "Hi there,")
    .replace(/Hi \{\{contact_first_name\}\}/g, "Hi")
    .replace(/Saw the \{\{specific_vehicle\}\} on your page — nice unit\./, "Saw your page — nice stock.")
    .replace(/Saw your \{\{specific_listing\}\} listing — lovely property\./, "Saw your listings — lovely properties.")
    .replace(/ in \{\{area\}\}/g, "")
    .replace(/\{\{business_name\}\} \{\{ad_gap_observation\}\}/, `${values.business_name} could get more from Facebook and Instagram`)
    .replace(/\{\{\w+\}\}/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  return { text, missing };
}

export function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
