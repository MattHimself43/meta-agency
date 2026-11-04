/** RFC 4180 CSV parser (quotes, escaped quotes, CRLF, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows;
}

/** Lead fields that can be imported, with header aliases for auto-mapping. */
export const LEAD_IMPORT_FIELDS = {
  business_name: ["business", "business name", "name", "company", "dealer", "agency"],
  contact_name: ["contact", "contact name", "owner", "manager"],
  phone: ["phone", "telephone", "tel", "mobile", "cell", "number"],
  whatsapp: ["whatsapp", "wa"],
  email: ["email", "e-mail"],
  area: ["area", "location", "town", "city", "region"],
  facebook_url: ["facebook", "facebook url", "fb", "fb page"],
  instagram_url: ["instagram", "instagram url", "ig"],
  website: ["website", "site", "url", "web"],
  maps_url: ["maps", "google maps", "maps url"],
  niche: ["niche", "category", "type"],
  notes: ["notes", "note", "comments"],
} as const;
export type LeadImportField = keyof typeof LEAD_IMPORT_FIELDS;

/** Guess which CSV column feeds which lead field. Returns { field: columnIndex }. */
export function autoMapColumns(headers: string[]): Partial<Record<LeadImportField, number>> {
  const out: Partial<Record<LeadImportField, number>> = {};
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/[_-]+/g, " "));
  for (const [field, aliases] of Object.entries(LEAD_IMPORT_FIELDS) as [LeadImportField, readonly string[]][]) {
    const idx = norm.findIndex((h, i) => !Object.values(out).includes(i) && (h === field.replace(/_/g, " ") || aliases.includes(h)));
    if (idx >= 0) out[field] = idx;
  }
  return out;
}
