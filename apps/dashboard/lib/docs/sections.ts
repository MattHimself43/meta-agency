/**
 * One description of each document's sections, shared by the HTML view, the editor, the share page and the PDF.
 * "missing_facts" is internal: shown to Matthias, never to the prospect.
 */
export type Section =
  | { key: string; title: string; type: "text" }
  | { key: string; title: string; type: "list" }
  | { key: string; title: string; type: "pairs"; a: string; b: string }
  | { key: string; title: string; type: "object"; fields: { key: string; label: string }[] };

export type DocKind = "audit" | "call_brief" | "proposal";

export const TITLE_FIELD: Record<DocKind, string | null> = { audit: "headline", call_brief: null, proposal: "title" };

export const SECTIONS: Record<DocKind, Section[]> = {
  audit: [
    { key: "headline", title: "Headline", type: "text" },
    { key: "summary", title: "Summary", type: "text" },
    { key: "current_ads", title: "Your current ads", type: "pairs", a: "description", b: "observation" },
    { key: "competitors", title: "What competitors are doing", type: "pairs", a: "name", b: "what_they_do_well" },
    { key: "quick_wins", title: "Three quick wins", type: "pairs", a: "title", b: "detail" },
    { key: "mock_ad", title: "A mock ad for you", type: "object", fields: [{ key: "hook", label: "Hook" }, { key: "primary_text", label: "Primary text" }, { key: "headline", label: "Headline" }, { key: "cta", label: "Button" }, { key: "visual_idea", label: "Visual" }] },
  ],
  call_brief: [
    { key: "snapshot", title: "Snapshot", type: "text" },
    { key: "stock_or_listings", title: "Stock / listings", type: "list" },
    { key: "current_ads", title: "Current ads", type: "list" },
    { key: "competitors", title: "Competitors", type: "pairs", a: "name", b: "note" },
    { key: "likely_objections", title: "Likely objections", type: "pairs", a: "objection", b: "response" },
    { key: "questions_to_ask", title: "Questions to ask", type: "list" },
    { key: "suggested_package_slug", title: "Suggested package", type: "text" },
    { key: "suggested_price_note", title: "Price note", type: "text" },
  ],
  proposal: [
    { key: "title", title: "Title", type: "text" },
    { key: "intro", title: "Introduction", type: "text" },
    { key: "goals", title: "Goals", type: "list" },
    { key: "plan", title: "The plan", type: "pairs", a: "phase", b: "detail" },
    { key: "package_slug", title: "Package (slug)", type: "text" },
    { key: "why_this_package", title: "Why this package", type: "text" },
    { key: "ad_spend_note", title: "Ad spend", type: "text" },
    { key: "terms", title: "Terms", type: "text" },
    { key: "next_steps", title: "Next steps", type: "list" },
  ],
};

type Rec = Record<string, unknown>;

/** Parse the editor form back into content. Pairs are one per line: "first :: second". */
export function parseEditorForm(kind: DocKind, form: FormData): Rec {
  const out: Rec = {};
  for (const s of SECTIONS[kind]) {
    if (s.type === "text") out[s.key] = String(form.get(`f:${s.key}`) ?? "").trim();
    else if (s.type === "list") out[s.key] = lines(form.get(`f:${s.key}`));
    else if (s.type === "pairs")
      out[s.key] = lines(form.get(`f:${s.key}`)).map((l) => {
        const [a, ...rest] = l.split("::");
        return { [s.a]: a!.trim(), [s.b]: rest.join("::").trim() };
      });
    else out[s.key] = Object.fromEntries(s.fields.map((f) => [f.key, String(form.get(`f:${s.key}.${f.key}`) ?? "").trim()]));
  }
  out.missing_facts = lines(form.get("f:missing_facts"));
  return out;
}

export function pairsToText(v: unknown, a: string, b: string): string {
  return Array.isArray(v) ? (v as Rec[]).map((p) => `${p[a] ?? ""} :: ${p[b] ?? ""}`).join("\n") : "";
}
export function listToText(v: unknown): string {
  return Array.isArray(v) ? (v as string[]).join("\n") : "";
}

function lines(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}
